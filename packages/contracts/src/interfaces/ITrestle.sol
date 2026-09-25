// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Reputation event categories recorded by TrestleEscrow.
enum ReputationEventType {
    PurchaseCompleted,
    SaleCompleted,
    AutoReleased,
    DisputeWon,
    DisputeLost,
    DisputeSplit,
    SellerRefunded
}

interface ITrestleReputation {
    function recordEvent(address user, ReputationEventType eventType, int256 weight) external;
    function getScore(address user) external view returns (int256);
}

interface ITrestleLoyalty {
    function mintReward(address to, uint256 amount) external;
    function feeDiscountBps(address user) external view returns (uint256);
}

interface ITrestleEscrow {
    function createOrderFor(
        address buyer,
        address seller,
        address token,
        uint256 amount,
        uint64 deliveryDeadline,
        bytes32 ref
    ) external payable returns (uint256 orderId);
}
