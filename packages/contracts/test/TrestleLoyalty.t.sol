// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TrestleLoyalty} from "../src/TrestleLoyalty.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract TrestleLoyaltyTest is Test {
    TrestleLoyalty loyalty;
    address admin = makeAddr("admin");
    address minter = makeAddr("minter");
    address alice = makeAddr("alice");

    function setUp() public {
        loyalty = new TrestleLoyalty(admin, 1_000); // 10% APR
        bytes32 role = loyalty.MINTER_ROLE();
        vm.prank(admin);
        loyalty.grantRole(role, minter);
        vm.prank(minter);
        loyalty.mintReward(alice, 1_000 ether);
    }

    function test_mintReward_onlyMinter() public {
        bytes32 role = loyalty.MINTER_ROLE();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role));
        loyalty.mintReward(alice, 1);
    }

    function test_stakeAndUnstake() public {
        vm.startPrank(alice);
        loyalty.stake(600 ether);
        assertEq(loyalty.stakedBalance(alice), 600 ether);
        assertEq(loyalty.balanceOf(alice), 400 ether);
        assertEq(loyalty.totalStaked(), 600 ether);
        loyalty.unstake(100 ether);
        assertEq(loyalty.stakedBalance(alice), 500 ether);
        assertEq(loyalty.balanceOf(alice), 500 ether);
        vm.stopPrank();
    }

    function test_unstakeMoreThanStakedReverts() public {
        vm.startPrank(alice);
        loyalty.stake(10 ether);
        vm.expectRevert(abi.encodeWithSelector(TrestleLoyalty.InsufficientStake.selector, 10 ether, 11 ether));
        loyalty.unstake(11 ether);
        vm.stopPrank();
    }

    function test_stakeZeroReverts() public {
        vm.prank(alice);
        vm.expectRevert(TrestleLoyalty.ZeroAmount.selector);
        loyalty.stake(0);
    }

    function test_stakeMoreThanBalanceReverts() public {
        vm.prank(alice);
        vm.expectRevert();
        loyalty.stake(2_000 ether);
    }

    function test_rewardsAccrueOverTimeAndClaim() public {
        vm.prank(alice);
        loyalty.stake(1_000 ether);
        vm.warp(block.timestamp + 365 days);
        assertEq(loyalty.pendingRewards(alice), 100 ether);
        vm.prank(alice);
        uint256 claimed = loyalty.claimRewards();
        assertEq(claimed, 100 ether);
        assertEq(loyalty.balanceOf(alice), 100 ether);
        assertEq(loyalty.pendingRewards(alice), 0);
        vm.prank(alice);
        vm.expectRevert(TrestleLoyalty.ZeroAmount.selector);
        loyalty.claimRewards();
    }

    function test_feeDiscountTiers() public {
        assertEq(loyalty.feeDiscountBps(alice), 0);
        vm.startPrank(alice);
        loyalty.stake(100 ether);
        assertEq(loyalty.feeDiscountBps(alice), 1_000);
        loyalty.stake(400 ether);
        assertEq(loyalty.feeDiscountBps(alice), 2_500);
        vm.stopPrank();
    }

    function test_votingWeightBoostsWithAge() public {
        vm.prank(alice);
        loyalty.stake(100 ether);
        assertEq(loyalty.votingWeight(alice), 100 ether);
        vm.warp(block.timestamp + 365 days);
        assertEq(loyalty.votingWeight(alice), 200 ether);
        vm.warp(block.timestamp + 365 days);
        assertEq(loyalty.votingWeight(alice), 200 ether); // capped
    }

    function test_setTiersValidation() public {
        TrestleLoyalty.DiscountTier[] memory t = new TrestleLoyalty.DiscountTier[](1);
        t[0] = TrestleLoyalty.DiscountTier({minStake: 1 ether, discountBps: 10_001});
        vm.prank(admin);
        vm.expectRevert(TrestleLoyalty.InvalidTiers.selector);
        loyalty.setTiers(t);
        t[0].discountBps = 9_000;
        vm.prank(admin);
        loyalty.setTiers(t);
        vm.prank(alice);
        loyalty.stake(1 ether);
        assertEq(loyalty.feeDiscountBps(alice), 9_000);
    }
}
