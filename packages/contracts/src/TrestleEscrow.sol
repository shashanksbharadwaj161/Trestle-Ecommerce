// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ITrestleReputation, ITrestleLoyalty, ReputationEventType} from "./interfaces/ITrestle.sol";

/// @title TrestleEscrow
/// @notice Holds buyer funds until the buyer confirms delivery, the delivery deadline passes without a
///         dispute (anyone may then trigger `autoRelease`), or an arbiter resolves a dispute.
/// @dev State machine: Created → (Released | Disputed | Refunded); Disputed → (Released | Refunded | Split).
///      `Delivered` is not a resting state: buyer confirmation atomically releases funds (Released).
///      Completion hooks (reputation + loyalty) are wrapped in try/catch so a hook failure can never lock funds.
contract TrestleEscrow is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");
    bytes32 public constant ROUTER_ROLE = keccak256("ROUTER_ROLE");
    uint256 public constant BPS = 10_000;
    uint64 public constant MIN_DELIVERY_WINDOW = 10 minutes;
    uint64 public constant MAX_DELIVERY_WINDOW = 180 days;

    enum Status {
        None,
        Created,
        Disputed,
        Released,
        Refunded,
        Split
    }

    struct Order {
        address buyer;
        address seller;
        address token; // address(0) = native
        uint256 amount;
        uint64 createdAt;
        uint64 deliveryDeadline;
        Status status;
        bytes32 ref; // off-chain order reference (keccak256 of the Trestle order id)
    }

    // reputation weights
    int256 public constant W_PURCHASE = 10;
    int256 public constant W_SALE = 10;
    int256 public constant W_AUTO_RELEASE_SALE = 8;
    int256 public constant W_DISPUTE_WON = 3;
    int256 public constant W_DISPUTE_LOST_SELLER = -25;
    int256 public constant W_DISPUTE_LOST_BUYER = -15;
    int256 public constant W_DISPUTE_SPLIT = -5;

    uint256 public nextOrderId = 1;
    mapping(uint256 orderId => Order) private _orders;

    ITrestleReputation public reputation;
    ITrestleLoyalty public loyalty;
    /// @notice loyalty units (18 decimals) minted per 1 base unit of `token`, scaled by 1e18.
    mapping(address token => uint256) public rewardPerUnit;

    event OrderCreated(
        uint256 indexed orderId,
        address indexed buyer,
        address indexed seller,
        address token,
        uint256 amount,
        uint64 deliveryDeadline,
        bytes32 ref
    );
    event DeliveryConfirmed(uint256 indexed orderId, address indexed buyer);
    event FundsReleased(uint256 indexed orderId, address indexed seller, uint256 amount, bool automatic);
    event DisputeRaised(uint256 indexed orderId, address indexed raisedBy, string reason);
    event DisputeResolved(
        uint256 indexed orderId,
        address indexed arbiter,
        uint256 buyerShareBps,
        uint256 buyerAmount,
        uint256 sellerAmount
    );
    event OrderRefunded(uint256 indexed orderId, address indexed buyer, uint256 amount);
    event HookFailed(uint256 indexed orderId, bytes32 hook);
    event HooksUpdated(address reputation, address loyalty);
    event RewardRateUpdated(address indexed token, uint256 rewardPerUnit);

    error InvalidStatus(Status current);
    error NotBuyer();
    error NotParticipant();
    error NotSeller();
    error DeadlineNotReached(uint64 deadline);
    error DeadlinePassed(uint64 deadline);
    error InvalidDeadline();
    error InvalidAmount();
    error InvalidShare();
    error ZeroAddress();
    error NativeValueMismatch();
    error UnsupportedToken();
    error NativeTransferFailed();

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ---------------------------------------------------------------------------------------------
    // Order creation
    // ---------------------------------------------------------------------------------------------

    /// @notice Buyer locks `amount` of `token` for `seller` until delivery.
    function createOrder(address seller, address token, uint256 amount, uint64 deliveryDeadline)
        external
        payable
        nonReentrant
        returns (uint256 orderId)
    {
        _pull(token, msg.sender, amount);
        orderId = _create(msg.sender, seller, token, amount, deliveryDeadline, bytes32(0));
    }

    /// @notice Router-funded order (cross-chain fulfilment or routed same-chain checkout).
    function createOrderFor(
        address buyer,
        address seller,
        address token,
        uint256 amount,
        uint64 deliveryDeadline,
        bytes32 ref
    ) external payable onlyRole(ROUTER_ROLE) nonReentrant returns (uint256 orderId) {
        if (buyer == address(0)) revert ZeroAddress();
        _pull(token, msg.sender, amount);
        orderId = _create(buyer, seller, token, amount, deliveryDeadline, ref);
    }

    function _create(
        address buyer,
        address seller,
        address token,
        uint256 amount,
        uint64 deadline,
        bytes32 ref
    ) internal returns (uint256 orderId) {
        if (seller == address(0)) revert ZeroAddress();
        if (seller == buyer) revert NotParticipant();
        if (
            deadline < block.timestamp + MIN_DELIVERY_WINDOW
                || deadline > block.timestamp + MAX_DELIVERY_WINDOW
        ) {
            revert InvalidDeadline();
        }
        orderId = nextOrderId++;
        _orders[orderId] = Order({
            buyer: buyer,
            seller: seller,
            token: token,
            amount: amount,
            createdAt: uint64(block.timestamp),
            deliveryDeadline: deadline,
            status: Status.Created,
            ref: ref
        });
        emit OrderCreated(orderId, buyer, seller, token, amount, deadline, ref);
    }

    // ---------------------------------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------------------------------

    function confirmDelivery(uint256 orderId) external nonReentrant {
        Order storage o = _orders[orderId];
        if (o.status != Status.Created) revert InvalidStatus(o.status);
        if (msg.sender != o.buyer) revert NotBuyer();
        emit DeliveryConfirmed(orderId, msg.sender);
        _release(orderId, o, false);
    }

    function autoRelease(uint256 orderId) external nonReentrant {
        Order storage o = _orders[orderId];
        if (o.status != Status.Created) revert InvalidStatus(o.status);
        if (block.timestamp <= o.deliveryDeadline) revert DeadlineNotReached(o.deliveryDeadline);
        _release(orderId, o, true);
    }

    function raiseDispute(uint256 orderId, string calldata reason) external {
        Order storage o = _orders[orderId];
        if (o.status != Status.Created) revert InvalidStatus(o.status);
        if (msg.sender != o.buyer && msg.sender != o.seller) revert NotParticipant();
        if (block.timestamp > o.deliveryDeadline) revert DeadlinePassed(o.deliveryDeadline);
        o.status = Status.Disputed;
        emit DisputeRaised(orderId, msg.sender, reason);
    }

    /// @param buyerShareBps share of escrowed funds returned to the buyer (0 = seller wins, 10000 = full refund).
    function resolveDispute(uint256 orderId, uint256 buyerShareBps)
        external
        onlyRole(ARBITER_ROLE)
        nonReentrant
    {
        Order storage o = _orders[orderId];
        if (o.status != Status.Disputed) revert InvalidStatus(o.status);
        if (buyerShareBps > BPS) revert InvalidShare();

        uint256 buyerAmount = (o.amount * buyerShareBps) / BPS;
        uint256 sellerAmount = o.amount - buyerAmount;
        address buyer = o.buyer;
        address seller = o.seller;
        address token = o.token;

        if (buyerShareBps == BPS) o.status = Status.Refunded;
        else if (buyerShareBps == 0) o.status = Status.Released;
        else o.status = Status.Split;

        emit DisputeResolved(orderId, msg.sender, buyerShareBps, buyerAmount, sellerAmount);

        if (buyerAmount > 0) _send(token, buyer, buyerAmount);
        if (sellerAmount > 0) _send(token, seller, sellerAmount);

        if (buyerShareBps == BPS) {
            _recordRep(orderId, buyer, ReputationEventType.DisputeWon, W_DISPUTE_WON);
            _recordRep(orderId, seller, ReputationEventType.DisputeLost, W_DISPUTE_LOST_SELLER);
        } else if (buyerShareBps == 0) {
            _recordRep(orderId, seller, ReputationEventType.DisputeWon, W_DISPUTE_WON);
            _recordRep(orderId, buyer, ReputationEventType.DisputeLost, W_DISPUTE_LOST_BUYER);
        } else {
            _recordRep(orderId, buyer, ReputationEventType.DisputeSplit, W_DISPUTE_SPLIT);
            _recordRep(orderId, seller, ReputationEventType.DisputeSplit, W_DISPUTE_SPLIT);
        }
        // loyalty accrues only on the portion that was actually paid for
        _mintLoyalty(orderId, buyer, token, sellerAmount);
    }

    /// @notice Seller voluntarily refunds the buyer in full (e.g. out of stock, or conceding a dispute).
    function refundBySeller(uint256 orderId) external nonReentrant {
        Order storage o = _orders[orderId];
        if (o.status != Status.Created && o.status != Status.Disputed) revert InvalidStatus(o.status);
        if (msg.sender != o.seller) revert NotSeller();
        o.status = Status.Refunded;
        emit OrderRefunded(orderId, o.buyer, o.amount);
        _send(o.token, o.buyer, o.amount);
        _recordRep(orderId, o.seller, ReputationEventType.SellerRefunded, 0);
    }

    function _release(uint256 orderId, Order storage o, bool automatic) internal {
        o.status = Status.Released;
        address seller = o.seller;
        address buyer = o.buyer;
        emit FundsReleased(orderId, seller, o.amount, automatic);
        _send(o.token, seller, o.amount);
        _recordRep(orderId, buyer, ReputationEventType.PurchaseCompleted, W_PURCHASE);
        if (automatic) _recordRep(orderId, seller, ReputationEventType.AutoReleased, W_AUTO_RELEASE_SALE);
        else _recordRep(orderId, seller, ReputationEventType.SaleCompleted, W_SALE);
        _mintLoyalty(orderId, buyer, o.token, o.amount);
    }

    // ---------------------------------------------------------------------------------------------
    // Hooks
    // ---------------------------------------------------------------------------------------------

    function _recordRep(uint256 orderId, address user, ReputationEventType t, int256 weight) internal {
        if (address(reputation) == address(0)) return;
        try reputation.recordEvent(user, t, weight) {}
        catch {
            emit HookFailed(orderId, "reputation");
        }
    }

    function _mintLoyalty(uint256 orderId, address buyer, address token, uint256 paidAmount) internal {
        uint256 rate = rewardPerUnit[token];
        if (address(loyalty) == address(0) || rate == 0 || paidAmount == 0) return;
        uint256 reward = (paidAmount * rate) / 1e18;
        if (reward == 0) return;
        try loyalty.mintReward(buyer, reward) {}
        catch {
            emit HookFailed(orderId, "loyalty");
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Token movement
    // ---------------------------------------------------------------------------------------------

    function _pull(address token, address from, uint256 amount) internal {
        if (amount == 0) revert InvalidAmount();
        if (token == address(0)) {
            if (msg.value != amount) revert NativeValueMismatch();
            return;
        }
        if (msg.value != 0) revert NativeValueMismatch();
        uint256 beforeBal = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(from, address(this), amount);
        // reject fee-on-transfer / rebasing tokens: escrow must hold exactly `amount`
        if (IERC20(token).balanceOf(address(this)) - beforeBal != amount) revert UnsupportedToken();
    }

    function _send(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert NativeTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Views & admin
    // ---------------------------------------------------------------------------------------------

    function getOrder(uint256 orderId) external view returns (Order memory) {
        return _orders[orderId];
    }

    function setHooks(address reputation_, address loyalty_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        reputation = ITrestleReputation(reputation_);
        loyalty = ITrestleLoyalty(loyalty_);
        emit HooksUpdated(reputation_, loyalty_);
    }

    /// @notice Configure loyalty rewards for `token`. Example: 5 TRST per 100 USDC (6 dp) → 5e16 * 1e18 / 1e6.
    function setRewardRate(address token, uint256 rewardPerUnit_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        rewardPerUnit[token] = rewardPerUnit_;
        emit RewardRateUpdated(token, rewardPerUnit_);
    }

    /// @notice Helper for deploy scripts: reward rate giving `bpsOfValue` TRST per whole token unit.
    function rewardRateFor(address token, uint256 bpsOfValue) external view returns (uint256) {
        uint8 dec = token == address(0) ? 18 : IERC20Metadata(token).decimals();
        return (1e18 * 1e18 * bpsOfValue) / (BPS * (10 ** dec));
    }
}
