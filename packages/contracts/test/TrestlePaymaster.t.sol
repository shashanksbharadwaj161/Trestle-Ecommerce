// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TrestleBase} from "./utils/Base.t.sol";
import {TrestlePaymaster} from "../src/TrestlePaymaster.sol";
import {TrestleEscrow} from "../src/TrestleEscrow.sol";
import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {SimpleAccountFactory} from "@account-abstraction/contracts/samples/SimpleAccountFactory.sol";
import {SimpleAccount} from "@account-abstraction/contracts/samples/SimpleAccount.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @notice End-to-end ERC-4337 flow: a buyer with ZERO native gas confirms delivery through a
///         counterfactual SimpleAccount; the TrestlePaymaster pays the EntryPoint.
contract TrestlePaymasterTest is TrestleBase {
    EntryPoint ep;
    SimpleAccountFactory factory;
    TrestlePaymaster paymaster;
    Stack s;
    uint256 ownerKey = 0xB0B;
    address owner;
    address account;
    address payable bundler = payable(makeAddr("bundler"));

    function setUp() public {
        vm.warp(1_750_000_000);
        s = _deployStack();
        ep = new EntryPoint();
        factory = new SimpleAccountFactory(IEntryPoint(address(ep)));
        paymaster = new TrestlePaymaster(IEntryPoint(address(ep)), admin, 0.05 ether);
        vm.deal(admin, 10 ether);
        vm.startPrank(admin);
        paymaster.deposit{value: 5 ether}();
        paymaster.addStake{value: 1 ether}(1 days);
        paymaster.setSponsoredTarget(address(s.escrow), true);
        paymaster.setSponsoredTarget(address(s.router), true);
        vm.stopPrank();

        owner = vm.addr(ownerKey);
        account = factory.getAddress(owner, 0);
        assertEq(account.code.length, 0); // counterfactual
        assertEq(owner.balance, 0); // the buyer holds no gas at all
        assertEq(account.balance, 0);
    }

    function _orderForAccount() internal returns (uint256 id) {
        _fund(s.usdc, buyer, 100e6);
        vm.startPrank(buyer);
        s.usdc.approve(address(s.router), type(uint256).max);
        id = s.router.checkoutDirect(keccak256("o"), address(s.usdc), 50e6, seller, account, 7 days);
        vm.stopPrank();
    }

    function _op(bytes memory callData, bool withInitCode, uint48 day) internal view returns (PackedUserOperation memory op) {
        op.sender = account;
        op.nonce = ep.getNonce(account, 0);
        if (withInitCode) {
            op.initCode = abi.encodePacked(address(factory), abi.encodeCall(factory.createAccount, (owner, 0)));
        }
        op.callData = callData;
        op.accountGasLimits = bytes32((uint256(600_000) << 128) | uint256(800_000));
        op.preVerificationGas = 60_000;
        op.gasFees = bytes32((uint256(1 gwei) << 128) | uint256(2 gwei));
        op.paymasterAndData = abi.encodePacked(address(paymaster), uint128(200_000), uint128(80_000), day);
    }

    function _sign(PackedUserOperation memory op) internal view returns (PackedUserOperation memory) {
        bytes32 h = ep.getUserOpHash(op);
        (uint8 v, bytes32 r, bytes32 sg) = vm.sign(ownerKey, MessageHashUtils.toEthSignedMessageHash(h));
        op.signature = abi.encodePacked(r, sg, v);
        return op;
    }

    function _submit(PackedUserOperation memory op) internal {
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        vm.prank(bundler, bundler);
        ep.handleOps(ops, bundler);
    }

    function _today() internal view returns (uint48) {
        return uint48(block.timestamp / 1 days);
    }

    function test_sponsorsGaslessConfirmDelivery() public {
        uint256 id = _orderForAccount();
        bytes memory call = abi.encodeCall(
            SimpleAccount.execute, (address(s.escrow), 0, abi.encodeCall(TrestleEscrow.confirmDelivery, (id)))
        );
        uint256 depositBefore = paymaster.getDeposit();
        _submit(_sign(_op(call, true, _today())));

        assertGt(account.code.length, 0, "account deployed");
        assertEq(uint8(s.escrow.getOrder(id).status), uint8(TrestleEscrow.Status.Released));
        assertEq(s.usdc.balanceOf(seller), 50e6);
        uint256 cost = depositBefore - paymaster.getDeposit();
        assertGt(cost, 0);
        // postOp only sees gas used before it runs; with the overhead estimate we're within 5% of real cost
        assertApproxEqRel(paymaster.spent(_today(), account), cost, 0.05e18, "cap accounting ~ actual cost");
        assertEq(owner.balance, 0);
    }

    function test_rejectsNonSponsoredTarget() public {
        bytes memory call = abi.encodeCall(
            SimpleAccount.execute, (address(s.usdc), 0, abi.encodeWithSignature("transfer(address,uint256)", seller, 1))
        );
        PackedUserOperation memory op = _sign(_op(call, true, _today()));
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA33 reverted",
                abi.encodeWithSelector(TrestlePaymaster.TargetNotSponsored.selector, address(s.usdc))
            )
        );
        _submit(op);
    }

    function test_enforcesDailyCap() public {
        vm.prank(admin);
        paymaster.setDailyCap(0.0001 ether); // below the op's maxCost
        uint256 id = _orderForAccount();
        bytes memory call = abi.encodeCall(
            SimpleAccount.execute, (address(s.escrow), 0, abi.encodeCall(TrestleEscrow.confirmDelivery, (id)))
        );
        PackedUserOperation memory op = _sign(_op(call, true, _today()));
        vm.expectRevert();
        _submit(op);
        assertEq(uint8(s.escrow.getOrder(id).status), uint8(TrestleEscrow.Status.Created));
    }

    function test_rejectsWrongDayBucket() public {
        uint256 id = _orderForAccount();
        bytes memory call = abi.encodeCall(
            SimpleAccount.execute, (address(s.escrow), 0, abi.encodeCall(TrestleEscrow.confirmDelivery, (id)))
        );
        // claim yesterday's (empty) bucket → EntryPoint enforces validUntil and rejects
        PackedUserOperation memory op = _sign(_op(call, true, _today() - 1));
        vm.expectRevert(
            abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA32 paymaster expired or not due")
        );
        _submit(op);
    }

    function test_rejectsUnsupportedSelector() public {
        bytes memory call = abi.encodeWithSignature("executeBatch(address[],bytes[])", new address[](0), new bytes[](0));
        PackedUserOperation memory op = _sign(_op(call, true, _today()));
        vm.expectRevert();
        _submit(op);
    }

    function test_onlyEntryPointCanValidate() public {
        PackedUserOperation memory op = _op("", false, _today());
        vm.expectRevert("Sender not EntryPoint");
        paymaster.validatePaymasterUserOp(op, bytes32(0), 1);
    }

    function test_adminFunctionsOnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert();
        paymaster.setDailyCap(1);
    }
}
