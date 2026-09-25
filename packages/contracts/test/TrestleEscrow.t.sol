// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TrestleBase} from "./utils/Base.t.sol";
import {TrestleEscrow} from "../src/TrestleEscrow.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReputationEventType} from "../src/interfaces/ITrestle.sol";

contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee", "FEE") {
        _mint(msg.sender, 1e30);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            super._update(from, address(0xdead), value / 100);
            value -= value / 100;
        }
        super._update(from, to, value);
    }
}

/// @dev Seller contract that tries to re-enter the escrow when it receives native funds.
contract ReentrantSeller {
    TrestleEscrow public escrow;
    uint256 public targetOrder;
    bool public reentered;
    bool public reentrySucceeded;

    constructor(TrestleEscrow e) {
        escrow = e;
    }

    function setTarget(uint256 id) external {
        targetOrder = id;
    }

    receive() external payable {
        if (!reentered) {
            reentered = true;
            try escrow.autoRelease(targetOrder) {
                reentrySucceeded = true;
            } catch {}
        }
    }
}

contract RevertingReputation {
    function recordEvent(address, ReputationEventType, int256) external pure {
        revert("boom");
    }

    function getScore(address) external pure returns (int256) {
        return 0;
    }
}

contract TrestleEscrowTest is TrestleBase {
    Stack internal s;
    uint64 internal deadline;

    function setUp() public {
        s = _deployStack();
        deadline = uint64(block.timestamp + 7 days);
        _fund(s.usdc, buyer, 1_000e6);
        vm.prank(buyer);
        s.usdc.approve(address(s.escrow), type(uint256).max);
        vm.deal(buyer, 100 ether);
    }

    function _create(uint256 amount) internal returns (uint256 id) {
        vm.prank(buyer);
        id = s.escrow.createOrder(seller, address(s.usdc), amount, deadline);
    }

    // --- creation --------------------------------------------------------------------------------

    function test_createOrder_locksFunds() public {
        vm.expectEmit(true, true, true, true);
        emit TrestleEscrow.OrderCreated(1, buyer, seller, address(s.usdc), 100e6, deadline, bytes32(0));
        uint256 id = _create(100e6);
        assertEq(id, 1);
        assertEq(s.usdc.balanceOf(address(s.escrow)), 100e6);
        TrestleEscrow.Order memory o = s.escrow.getOrder(id);
        assertEq(uint8(o.status), uint8(TrestleEscrow.Status.Created));
        assertEq(o.buyer, buyer);
        assertEq(o.amount, 100e6);
    }

    function test_createOrder_native() public {
        vm.prank(buyer);
        uint256 id = s.escrow.createOrder{value: 1 ether}(seller, address(0), 1 ether, deadline);
        assertEq(address(s.escrow).balance, 1 ether);
        vm.prank(buyer);
        s.escrow.confirmDelivery(id);
        assertEq(seller.balance, 1 ether);
    }

    function test_createOrder_revertsOnNativeMismatch() public {
        vm.prank(buyer);
        vm.expectRevert(TrestleEscrow.NativeValueMismatch.selector);
        s.escrow.createOrder{value: 0.5 ether}(seller, address(0), 1 ether, deadline);
    }

    function test_createOrder_revertsOnZeroAmount() public {
        vm.prank(buyer);
        vm.expectRevert(TrestleEscrow.InvalidAmount.selector);
        s.escrow.createOrder(seller, address(s.usdc), 0, deadline);
    }

    function test_createOrder_revertsOnBadDeadline() public {
        vm.startPrank(buyer);
        vm.expectRevert(TrestleEscrow.InvalidDeadline.selector);
        s.escrow.createOrder(seller, address(s.usdc), 1e6, uint64(block.timestamp + 1));
        vm.expectRevert(TrestleEscrow.InvalidDeadline.selector);
        s.escrow.createOrder(seller, address(s.usdc), 1e6, uint64(block.timestamp + 365 days));
        vm.stopPrank();
    }

    function test_createOrder_rejectsFeeOnTransferToken() public {
        FeeOnTransferToken fot = new FeeOnTransferToken();
        fot.transfer(buyer, 1e20);
        vm.startPrank(buyer);
        fot.approve(address(s.escrow), type(uint256).max);
        vm.expectRevert(TrestleEscrow.UnsupportedToken.selector);
        s.escrow.createOrder(seller, address(fot), 1e18, deadline);
        vm.stopPrank();
    }

    function test_createOrderFor_onlyRouter() public {
        bytes32 role = s.escrow.ROUTER_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        s.escrow.createOrderFor(buyer, seller, address(s.usdc), 1e6, deadline, bytes32("ref"));
    }

    // --- delivery & release ----------------------------------------------------------------------

    function test_confirmDelivery_releasesAndRewards() public {
        uint256 id = _create(200e6);
        vm.prank(buyer);
        s.escrow.confirmDelivery(id);
        assertEq(s.usdc.balanceOf(seller), 200e6);
        assertEq(uint8(s.escrow.getOrder(id).status), uint8(TrestleEscrow.Status.Released));
        // 5% of 200 USDC value => 10 TRST
        assertEq(s.loyalty.balanceOf(buyer), 10 ether);
        assertEq(s.reputation.getScore(buyer), 10e18);
        assertEq(s.reputation.getScore(seller), 10e18);
    }

    function test_confirmDelivery_onlyBuyer() public {
        uint256 id = _create(1e6);
        vm.prank(seller);
        vm.expectRevert(TrestleEscrow.NotBuyer.selector);
        s.escrow.confirmDelivery(id);
    }

    function test_confirmDelivery_cannotDoubleRelease() public {
        uint256 id = _create(1e6);
        vm.startPrank(buyer);
        s.escrow.confirmDelivery(id);
        vm.expectRevert(
            abi.encodeWithSelector(TrestleEscrow.InvalidStatus.selector, TrestleEscrow.Status.Released)
        );
        s.escrow.confirmDelivery(id);
        vm.stopPrank();
    }

    function test_autoRelease_afterDeadline() public {
        uint256 id = _create(50e6);
        vm.warp(deadline + 1);
        vm.prank(stranger);
        s.escrow.autoRelease(id);
        assertEq(s.usdc.balanceOf(seller), 50e6);
        assertEq(s.reputation.getScore(seller), 8e18);
    }

    function test_autoRelease_revertsBeforeDeadline() public {
        uint256 id = _create(50e6);
        vm.expectRevert(abi.encodeWithSelector(TrestleEscrow.DeadlineNotReached.selector, deadline));
        s.escrow.autoRelease(id);
    }

    function test_autoRelease_revertsWhenDisputed() public {
        uint256 id = _create(50e6);
        vm.prank(buyer);
        s.escrow.raiseDispute(id, "damaged");
        vm.warp(deadline + 1);
        vm.expectRevert(
            abi.encodeWithSelector(TrestleEscrow.InvalidStatus.selector, TrestleEscrow.Status.Disputed)
        );
        s.escrow.autoRelease(id);
    }

    // --- disputes --------------------------------------------------------------------------------

    function test_raiseDispute_onlyParticipants() public {
        uint256 id = _create(1e6);
        vm.prank(stranger);
        vm.expectRevert(TrestleEscrow.NotParticipant.selector);
        s.escrow.raiseDispute(id, "x");
    }

    function test_raiseDispute_revertsAfterDeadline() public {
        uint256 id = _create(1e6);
        vm.warp(deadline + 1);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(TrestleEscrow.DeadlinePassed.selector, deadline));
        s.escrow.raiseDispute(id, "late");
    }

    function test_resolveDispute_split() public {
        uint256 id = _create(100e6);
        vm.prank(buyer);
        s.escrow.raiseDispute(id, "not as described");
        vm.prank(arbiter);
        s.escrow.resolveDispute(id, 3_000);
        assertEq(s.usdc.balanceOf(buyer), 1_000e6 - 100e6 + 30e6);
        assertEq(s.usdc.balanceOf(seller), 70e6);
        assertEq(uint8(s.escrow.getOrder(id).status), uint8(TrestleEscrow.Status.Split));
        assertEq(s.reputation.getScore(seller), -5e18);
        // loyalty only on the 70 USDC actually paid
        assertEq(s.loyalty.balanceOf(buyer), 3.5 ether);
    }

    function test_resolveDispute_fullRefund() public {
        uint256 id = _create(100e6);
        vm.prank(buyer);
        s.escrow.raiseDispute(id, "never arrived");
        vm.prank(arbiter);
        s.escrow.resolveDispute(id, 10_000);
        assertEq(s.usdc.balanceOf(buyer), 1_000e6);
        assertEq(uint8(s.escrow.getOrder(id).status), uint8(TrestleEscrow.Status.Refunded));
        assertEq(s.reputation.getScore(seller), -25e18);
        assertEq(s.loyalty.balanceOf(buyer), 0);
    }

    function test_resolveDispute_sellerWins() public {
        uint256 id = _create(100e6);
        vm.prank(buyer);
        s.escrow.raiseDispute(id, "changed my mind");
        vm.prank(arbiter);
        s.escrow.resolveDispute(id, 0);
        assertEq(s.usdc.balanceOf(seller), 100e6);
        assertEq(uint8(s.escrow.getOrder(id).status), uint8(TrestleEscrow.Status.Released));
        assertEq(s.reputation.getScore(buyer), -15e18);
    }

    function test_resolveDispute_onlyArbiter() public {
        uint256 id = _create(1e6);
        vm.prank(buyer);
        s.escrow.raiseDispute(id, "x");
        bytes32 role = s.escrow.ARBITER_ROLE();
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, buyer, role)
        );
        s.escrow.resolveDispute(id, 10_000);
    }

    function test_resolveDispute_rejectsInvalidShareAndStatus() public {
        uint256 id = _create(1e6);
        vm.prank(arbiter);
        vm.expectRevert(
            abi.encodeWithSelector(TrestleEscrow.InvalidStatus.selector, TrestleEscrow.Status.Created)
        );
        s.escrow.resolveDispute(id, 5_000);
        vm.prank(buyer);
        s.escrow.raiseDispute(id, "x");
        vm.prank(arbiter);
        vm.expectRevert(TrestleEscrow.InvalidShare.selector);
        s.escrow.resolveDispute(id, 10_001);
    }

    function test_refundBySeller() public {
        uint256 id = _create(10e6);
        vm.prank(stranger);
        vm.expectRevert(TrestleEscrow.NotSeller.selector);
        s.escrow.refundBySeller(id);
        vm.prank(seller);
        s.escrow.refundBySeller(id);
        assertEq(s.usdc.balanceOf(buyer), 1_000e6);
        assertEq(uint8(s.escrow.getOrder(id).status), uint8(TrestleEscrow.Status.Refunded));
    }

    // --- safety ----------------------------------------------------------------------------------

    function test_reentrancyGuardBlocksNestedRelease() public {
        ReentrantSeller evil = new ReentrantSeller(s.escrow);
        vm.prank(buyer);
        uint256 id1 = s.escrow.createOrder{value: 1 ether}(address(evil), address(0), 1 ether, deadline);
        vm.prank(buyer);
        uint256 id2 = s.escrow.createOrder{value: 1 ether}(address(evil), address(0), 1 ether, deadline);
        evil.setTarget(id2);
        vm.warp(deadline + 1);
        s.escrow.autoRelease(id1);
        assertTrue(evil.reentered());
        assertFalse(evil.reentrySucceeded());
        assertEq(uint8(s.escrow.getOrder(id2).status), uint8(TrestleEscrow.Status.Created));
        assertEq(address(evil).balance, 1 ether);
    }

    function test_hookFailureDoesNotLockFunds() public {
        RevertingReputation bad = new RevertingReputation();
        vm.prank(admin);
        s.escrow.setHooks(address(bad), address(s.loyalty));
        uint256 id = _create(10e6);
        vm.expectEmit(true, false, false, true);
        emit TrestleEscrow.HookFailed(id, "reputation");
        vm.prank(buyer);
        s.escrow.confirmDelivery(id);
        assertEq(s.usdc.balanceOf(seller), 10e6);
    }

    function testFuzz_splitConservesFunds(uint96 amount, uint16 bps) public {
        amount = uint96(bound(amount, 1, 1_000e6));
        bps = uint16(bound(bps, 0, 10_000));
        uint256 id = _create(amount);
        vm.prank(buyer);
        s.escrow.raiseDispute(id, "fuzz");
        uint256 buyerBefore = s.usdc.balanceOf(buyer);
        vm.prank(arbiter);
        s.escrow.resolveDispute(id, bps);
        assertEq(s.usdc.balanceOf(buyer) - buyerBefore + s.usdc.balanceOf(seller), amount);
        assertEq(s.usdc.balanceOf(address(s.escrow)), 0);
    }
}
