// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TrestleLoyalty (TRST)
/// @notice ERC-20 rewards token minted on completed purchases. Holders can stake TRST to earn a
///         time-weighted staking reward, receive checkout fee discounts (read by TrestlePaymentRouter)
///         and gain governance weight.
contract TrestleLoyalty is ERC20, AccessControl, ReentrancyGuard {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 public constant BPS = 10_000;
    uint256 public constant YEAR = 365 days;
    uint256 public constant MAX_TIERS = 8;

    struct StakeInfo {
        uint256 amount;
        uint256 accrued; // unclaimed rewards as of lastAccrual
        uint64 lastAccrual;
        uint64 stakedSince; // weighted-average stake start, for governance weight
    }

    struct DiscountTier {
        uint256 minStake;
        uint16 discountBps;
    }

    uint256 public rewardAprBps;
    uint256 public totalStaked;
    mapping(address account => StakeInfo) private _stakes;
    DiscountTier[] private _tiers;

    event RewardMinted(address indexed to, uint256 amount);
    event Staked(address indexed user, uint256 amount, uint256 newStake);
    event Unstaked(address indexed user, uint256 amount, uint256 newStake);
    event RewardsClaimed(address indexed user, uint256 amount);
    event RewardAprUpdated(uint256 aprBps);
    event TiersUpdated();

    error ZeroAmount();
    error InsufficientStake(uint256 staked, uint256 requested);
    error InvalidTiers();

    constructor(address admin, uint256 rewardAprBps_) ERC20("Trestle Loyalty", "TRST") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        rewardAprBps = rewardAprBps_;
        _tiers.push(DiscountTier(100 ether, 1_000)); // 10% off checkout fees
        _tiers.push(DiscountTier(500 ether, 2_500)); // 25%
        _tiers.push(DiscountTier(2_000 ether, 5_000)); // 50%
    }

    // --- Minting ---------------------------------------------------------------------------------

    function mintReward(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (amount == 0) return;
        _mint(to, amount);
        emit RewardMinted(to, amount);
    }

    // --- Staking ---------------------------------------------------------------------------------

    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        StakeInfo storage s = _stakes[msg.sender];
        _accrue(s);
        // weighted-average start time so topping up doesn't reset (or game) governance weight
        uint256 newAmount = s.amount + amount;
        s.stakedSince = s.amount == 0
            ? uint64(block.timestamp)
            : uint64((uint256(s.stakedSince) * s.amount + block.timestamp * amount) / newAmount);
        s.amount = newAmount;
        totalStaked += amount;
        _transfer(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount, newAmount);
    }

    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        StakeInfo storage s = _stakes[msg.sender];
        if (amount > s.amount) revert InsufficientStake(s.amount, amount);
        _accrue(s);
        s.amount -= amount;
        totalStaked -= amount;
        if (s.amount == 0) s.stakedSince = 0;
        _transfer(address(this), msg.sender, amount);
        emit Unstaked(msg.sender, amount, s.amount);
    }

    function claimRewards() external nonReentrant returns (uint256 reward) {
        StakeInfo storage s = _stakes[msg.sender];
        _accrue(s);
        reward = s.accrued;
        if (reward == 0) revert ZeroAmount();
        s.accrued = 0;
        _mint(msg.sender, reward);
        emit RewardsClaimed(msg.sender, reward);
    }

    function _accrue(StakeInfo storage s) internal {
        if (s.amount > 0 && s.lastAccrual != 0) {
            s.accrued += _pending(s.amount, s.lastAccrual);
        }
        s.lastAccrual = uint64(block.timestamp);
    }

    function _pending(uint256 amount, uint64 since) internal view returns (uint256) {
        return (amount * rewardAprBps * (block.timestamp - since)) / (BPS * YEAR);
    }

    // --- Views -----------------------------------------------------------------------------------

    function stakeOf(address user) external view returns (StakeInfo memory) {
        return _stakes[user];
    }

    function stakedBalance(address user) external view returns (uint256) {
        return _stakes[user].amount;
    }

    function pendingRewards(address user) public view returns (uint256) {
        StakeInfo storage s = _stakes[user];
        if (s.amount == 0 || s.lastAccrual == 0) return s.accrued;
        return s.accrued + _pending(s.amount, s.lastAccrual);
    }

    /// @notice Checkout fee discount (basis points of the protocol fee) earned by staking.
    function feeDiscountBps(address user) external view returns (uint256 discount) {
        uint256 staked = _stakes[user].amount;
        uint256 n = _tiers.length;
        for (uint256 i; i < n; ++i) {
            if (staked >= _tiers[i].minStake && _tiers[i].discountBps > discount) discount = _tiers[i].discountBps;
        }
    }

    /// @notice Governance weight: stake, boosted linearly up to 2x after one year staked.
    function votingWeight(address user) external view returns (uint256) {
        StakeInfo storage s = _stakes[user];
        if (s.amount == 0) return 0;
        uint256 age = block.timestamp - s.stakedSince;
        if (age > YEAR) age = YEAR;
        return s.amount + (s.amount * age) / YEAR;
    }

    function tiers() external view returns (DiscountTier[] memory) {
        return _tiers;
    }

    // --- Admin -----------------------------------------------------------------------------------

    function setRewardApr(uint256 aprBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(aprBps <= 5_000, "apr too high");
        rewardAprBps = aprBps;
        emit RewardAprUpdated(aprBps);
    }

    function setTiers(DiscountTier[] calldata newTiers) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTiers.length > MAX_TIERS) revert InvalidTiers();
        delete _tiers;
        for (uint256 i; i < newTiers.length; ++i) {
            if (newTiers[i].discountBps > BPS) revert InvalidTiers();
            _tiers.push(newTiers[i]);
        }
        emit TiersUpdated();
    }
}
