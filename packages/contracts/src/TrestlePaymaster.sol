// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BasePaymaster} from "@account-abstraction/contracts/core/BasePaymaster.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {_packValidationData} from "@account-abstraction/contracts/core/Helpers.sol";

/// @title TrestlePaymaster
/// @notice ERC-4337 (EntryPoint v0.7) paymaster that sponsors gas for smart-account calls into the Trestle
///         contracts (escrow, router, loyalty, …) up to a per-sender daily cap.
/// @dev paymasterAndData = paymaster (20) | pmVerificationGasLimit (16) | pmPostOpGasLimit (16) | day (6, uint48)
///      Validation never reads TIMESTAMP (banned by ERC-7562). Instead the bundler supplies the UTC `day`
///      bucket and the paymaster returns validAfter/validUntil = [day, day+1) so the EntryPoint enforces
///      that the op is only valid on that day. Spend is tracked in `spent[day][sender]` (sender-associated
///      storage) — reserved at `maxCost` during validation and trued-up to the real cost in postOp.
///      Only `SimpleAccount.execute(target, value, data)` calls whose target is allow-listed are sponsored;
///      plain value transfers (empty data) are also allowed so users can sweep refunds to their EOA.
contract TrestlePaymaster is BasePaymaster {
    bytes4 public constant EXECUTE_SELECTOR = bytes4(keccak256("execute(address,uint256,bytes)"));
    uint256 internal constant DAY_OFFSET = 52; // PAYMASTER_DATA_OFFSET
    /// @dev `actualGasCost` handed to postOp excludes postOp itself; charge an estimate of it to the cap.
    uint256 public constant POSTOP_OVERHEAD_GAS = 45_000;

    mapping(address target => bool) public sponsoredTargets;
    mapping(address sender => bool) public senderAllowed;
    bool public senderAllowlistEnabled;
    uint256 public dailyCapWei;
    mapping(uint256 day => mapping(address sender => uint256)) public spent;

    event TargetSponsored(address indexed target, bool enabled);
    event SenderAllowed(address indexed sender, bool enabled);
    event SenderAllowlistToggled(bool enabled);
    event DailyCapUpdated(uint256 capWei);
    event GasSponsored(address indexed sender, uint256 indexed day, uint256 actualGasCost, bool opSucceeded);

    error InvalidPaymasterData();
    error UnsupportedCall(bytes4 selector);
    error TargetNotSponsored(address target);
    error SenderNotAllowed(address sender);
    error DailyCapExceeded(uint256 spentWei, uint256 requestedWei, uint256 capWei);

    constructor(IEntryPoint entryPoint_, address owner_, uint256 dailyCapWei_) BasePaymaster(entryPoint_) {
        dailyCapWei = dailyCapWei_;
        if (owner_ != msg.sender) _transferOwnership(owner_);
    }

    function _validatePaymasterUserOp(PackedUserOperation calldata userOp, bytes32, uint256 maxCost)
        internal
        override
        returns (bytes memory context, uint256 validationData)
    {
        if (userOp.paymasterAndData.length < DAY_OFFSET + 6) revert InvalidPaymasterData();
        uint256 day = uint48(bytes6(userOp.paymasterAndData[DAY_OFFSET:DAY_OFFSET + 6]));

        address sender = userOp.sender;
        if (senderAllowlistEnabled && !senderAllowed[sender]) revert SenderNotAllowed(sender);

        bytes calldata callData = userOp.callData;
        if (callData.length < 4 || bytes4(callData[:4]) != EXECUTE_SELECTOR) {
            revert UnsupportedCall(callData.length >= 4 ? bytes4(callData[:4]) : bytes4(0));
        }
        (address target,, bytes memory data) = abi.decode(callData[4:], (address, uint256, bytes));
        if (data.length != 0 && !sponsoredTargets[target]) revert TargetNotSponsored(target);

        uint256 already = spent[day][sender];
        if (already + maxCost > dailyCapWei) revert DailyCapExceeded(already, maxCost, dailyCapWei);
        spent[day][sender] = already + maxCost;

        context = abi.encode(sender, day, maxCost);
        uint48 validAfter = uint48(day * 1 days);
        uint48 validUntil = uint48((day + 1) * 1 days - 1);
        validationData = _packValidationData(false, validUntil, validAfter);
    }

    function _postOp(PostOpMode mode, bytes calldata context, uint256 actualGasCost, uint256 feePerGas)
        internal
        override
    {
        (address sender, uint256 day, uint256 maxCost) = abi.decode(context, (address, uint256, uint256));
        // replace the reservation with the (estimated) real cost, never exceeding the reservation
        uint256 charged = actualGasCost + POSTOP_OVERHEAD_GAS * feePerGas;
        if (charged > maxCost) charged = maxCost;
        spent[day][sender] = spent[day][sender] - maxCost + charged;
        emit GasSponsored(sender, day, charged, mode == PostOpMode.opSucceeded);
    }

    // --- views ---------------------------------------------------------------------------------

    function currentDay() external view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function remainingToday(address sender) external view returns (uint256) {
        uint256 s = spent[block.timestamp / 1 days][sender];
        return s >= dailyCapWei ? 0 : dailyCapWei - s;
    }

    // --- admin ---------------------------------------------------------------------------------

    function setSponsoredTarget(address target, bool enabled) external onlyOwner {
        sponsoredTargets[target] = enabled;
        emit TargetSponsored(target, enabled);
    }

    function setSenderAllowed(address sender, bool enabled) external onlyOwner {
        senderAllowed[sender] = enabled;
        emit SenderAllowed(sender, enabled);
    }

    function setSenderAllowlistEnabled(bool enabled) external onlyOwner {
        senderAllowlistEnabled = enabled;
        emit SenderAllowlistToggled(enabled);
    }

    function setDailyCap(uint256 capWei) external onlyOwner {
        dailyCapWei = capWei;
        emit DailyCapUpdated(capWei);
    }
}
