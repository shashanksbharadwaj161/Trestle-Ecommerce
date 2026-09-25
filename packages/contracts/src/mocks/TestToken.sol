// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TestToken
/// @notice Faucet-enabled ERC-20 used as the demo stablecoins (tUSDC / tDAI) on local and test networks.
/// @dev NOT a real stablecoin. Anyone can claim `faucetAmount` once per `faucetCooldown`.
contract TestToken is ERC20, Ownable {
    uint8 private immutable _decimals;
    uint256 public immutable faucetAmount;
    uint256 public constant faucetCooldown = 1 days;
    mapping(address account => uint256 timestamp) public lastFaucetClaim;

    error FaucetCooldown(uint256 availableAt);

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 faucetAmount_,
        address owner_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        _decimals = decimals_;
        faucetAmount = faucetAmount_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function faucet() external {
        uint256 last = lastFaucetClaim[msg.sender];
        if (last != 0 && block.timestamp < last + faucetCooldown) {
            revert FaucetCooldown(last + faucetCooldown);
        }
        lastFaucetClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, faucetAmount);
    }
}
