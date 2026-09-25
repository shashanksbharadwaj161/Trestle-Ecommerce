// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TrestleReputation} from "../src/TrestleReputation.sol";
import {ReputationEventType} from "../src/interfaces/ITrestle.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract TrestleReputationTest is Test {
    TrestleReputation rep;
    address admin = makeAddr("admin");
    address recorder = makeAddr("recorder");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        rep = new TrestleReputation(admin, 30 days);
        bytes32 role = rep.RECORDER_ROLE();
        vm.prank(admin);
        rep.grantRole(role, recorder);
    }

    function test_recordEvent_mintsSoulboundTokenOnce() public {
        vm.startPrank(recorder);
        rep.recordEvent(alice, ReputationEventType.PurchaseCompleted, 10);
        rep.recordEvent(alice, ReputationEventType.PurchaseCompleted, 5);
        vm.stopPrank();
        assertEq(rep.balanceOf(alice), 1);
        assertEq(rep.tokenOf(alice), 1);
        assertEq(rep.getScore(alice), 15e18);
        assertTrue(rep.locked(1));
        (,,, uint32 pos, uint32 neg) = rep.getReputation(alice);
        assertEq(pos, 2);
        assertEq(neg, 0);
    }

    function test_recordEvent_onlyRecorder() public {
        bytes32 role = rep.RECORDER_ROLE();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role));
        rep.recordEvent(alice, ReputationEventType.PurchaseCompleted, 100);
    }

    function test_transfersAndApprovalsRevert() public {
        vm.prank(recorder);
        rep.recordEvent(alice, ReputationEventType.SaleCompleted, 1);
        vm.startPrank(alice);
        vm.expectRevert(TrestleReputation.Soulbound.selector);
        rep.transferFrom(alice, bob, 1);
        vm.expectRevert(TrestleReputation.Soulbound.selector);
        rep.approve(bob, 1);
        vm.expectRevert(TrestleReputation.Soulbound.selector);
        rep.setApprovalForAll(bob, true);
        vm.stopPrank();
        assertEq(rep.ownerOf(1), alice);
    }

    function test_scoreDecaysWithHalfLife() public {
        vm.prank(recorder);
        rep.recordEvent(alice, ReputationEventType.PurchaseCompleted, 100);
        vm.warp(block.timestamp + 30 days);
        assertEq(rep.getScore(alice), 50e18);
        vm.warp(block.timestamp + 15 days); // half of the next half-life: linear approx → 50 * (1 - 1/4)
        assertEq(rep.getScore(alice), 37.5e18);
        vm.warp(block.timestamp + 365 days * 20);
        assertEq(rep.getScore(alice), 0);
    }

    function test_negativeScores() public {
        vm.startPrank(recorder);
        rep.recordEvent(bob, ReputationEventType.SaleCompleted, 10);
        rep.recordEvent(bob, ReputationEventType.DisputeLost, -25);
        vm.stopPrank();
        assertEq(rep.getScore(bob), -15e18);
        (,,,, uint32 neg) = rep.getReputation(bob);
        assertEq(neg, 1);
        string memory uri = rep.tokenURI(1);
        assertGt(bytes(uri).length, 29);
    }

    function test_zeroAddressRejected() public {
        vm.prank(recorder);
        vm.expectRevert(TrestleReputation.ZeroAddress.selector);
        rep.recordEvent(address(0), ReputationEventType.SaleCompleted, 1);
    }

    function test_supportsERC5192() public view {
        assertTrue(rep.supportsInterface(0xb45a3c0e));
        assertTrue(rep.supportsInterface(0x80ac58cd)); // ERC-721
    }

    function test_lockedRevertsForUnknownToken() public {
        vm.expectRevert();
        rep.locked(99);
    }
}
