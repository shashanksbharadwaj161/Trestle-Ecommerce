// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TrestleBase} from "./utils/Base.t.sol";
import {TrestlePaymentRouter} from "../src/TrestlePaymentRouter.sol";
import {TrestleEscrow} from "../src/TrestleEscrow.sol";
import {AttestationRelayerAdapter} from "../src/adapters/AttestationRelayerAdapter.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

/// @notice Two independent Trestle deployments ("chain A" and "chain B") on one test EVM. We switch
///         `block.chainid` with vm.chainId before every interaction so EIP-712 domains and chain checks
///         behave exactly as on two separate networks.
contract TrestlePaymentRouterTest is TrestleBase {
    uint256 constant CHAIN_A = 31337;
    uint256 constant CHAIN_B = 31338;

    Stack a;
    Stack b;
    address buyerAccountB = makeAddr("buyerSmartAccountOnB");

    function setUp() public {
        vm.chainId(CHAIN_A);
        a = _deployStack();
        vm.chainId(CHAIN_B);
        b = _deployStack();

        vm.chainId(CHAIN_A);
        vm.prank(admin);
        a.router.setRemoteRouter(CHAIN_B, address(b.router));
        vm.chainId(CHAIN_B);
        vm.prank(admin);
        b.router.setRemoteRouter(CHAIN_A, address(a.router));

        // solver liquidity on B
        _fund(b.usdc, relayer, 10_000e6);
        vm.startPrank(relayer);
        b.usdc.approve(address(b.router), type(uint256).max);
        b.router.depositLiquidity(address(b.usdc), 5_000e6);
        vm.stopPrank();

        // buyer funds on A
        vm.chainId(CHAIN_A);
        _fund(a.usdc, buyer, 1_000e6);
        vm.prank(buyer);
        a.usdc.approve(address(a.router), type(uint256).max);
        vm.deal(buyer, 10 ether);
    }

    // --- helpers ---------------------------------------------------------------------------------

    function _params(address token, uint256 sourceAmount, uint256 destAmount)
        internal
        view
        returns (TrestlePaymentRouter.IntentParams memory p)
    {
        p = TrestlePaymentRouter.IntentParams({
            orderRef: keccak256("order-1"),
            sourceToken: token,
            sourceAmount: sourceAmount,
            destChainId: CHAIN_B,
            destToken: address(b.usdc),
            destAmount: destAmount,
            seller: seller,
            destBuyer: buyerAccountB,
            deliveryWindow: 7 days,
            expiry: uint64(block.timestamp + 1 hours)
        });
    }

    function _createIntent(uint256 sourceAmount, uint256 destAmount) internal returns (bytes32 id) {
        vm.chainId(CHAIN_A);
        vm.prank(buyer);
        id = a.router.createIntent(_params(address(a.usdc), sourceAmount, destAmount));
    }

    function _message(bytes32 id) internal view returns (TrestlePaymentRouter.FulfillMessage memory m) {
        TrestlePaymentRouter.Intent memory i = a.router.getIntent(id);
        m = TrestlePaymentRouter.FulfillMessage({
            intentId: id,
            nonce: i.nonce,
            sourceChainId: CHAIN_A,
            sourceRouter: address(a.router),
            destChainId: CHAIN_B,
            buyer: i.destBuyer,
            seller: i.seller,
            destToken: i.destToken,
            destAmount: i.destAmount,
            orderRef: i.orderRef,
            deliveryWindow: i.deliveryWindow,
            expiry: i.expiry
        });
    }

    function _proof(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s_) = vm.sign(key, digest);
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = abi.encodePacked(r, s_, v);
        return abi.encode(sigs);
    }

    function _fulfill(TrestlePaymentRouter.FulfillMessage memory m) internal returns (uint256 escrowId) {
        vm.chainId(CHAIN_B);
        bytes memory proof = _proof(attesterKey, b.router.hashFulfillMessage(m));
        vm.prank(relayer);
        escrowId = b.router.fulfillIntent(m, proof);
    }

    function _receipt(bytes32 id, uint256 escrowId) internal view returns (TrestlePaymentRouter.FulfillmentReceipt memory) {
        return TrestlePaymentRouter.FulfillmentReceipt({
            intentId: id, destChainId: CHAIN_B, destRouter: address(b.router), escrowOrderId: escrowId, solver: relayer
        });
    }

    // --- happy path ------------------------------------------------------------------------------

    function test_fullCrossChainFlow() public {
        bytes32 id = _createIntent(101e6, 100e6);
        assertEq(a.usdc.balanceOf(address(a.router)), 101e6);
        TrestlePaymentRouter.Intent memory i = a.router.getIntent(id);
        assertEq(uint8(i.status), uint8(TrestlePaymentRouter.IntentStatus.Created));
        assertEq(i.fee, 1.01e6); // 1% protocol fee

        // destination: solver liquidity funds the escrow
        uint256 escrowId = _fulfill(_message(id));
        assertEq(escrowId, 1);
        assertEq(b.router.fulfilledIntents(id), 1);
        assertEq(b.router.solverLiquidity(relayer, address(b.usdc)), 4_900e6);
        TrestleEscrow.Order memory o = b.escrow.getOrder(escrowId);
        assertEq(o.buyer, buyerAccountB);
        assertEq(o.seller, seller);
        assertEq(o.amount, 100e6);
        assertEq(o.ref, keccak256("order-1"));

        // source: solver repaid, fee to treasury
        vm.chainId(CHAIN_A);
        TrestlePaymentRouter.FulfillmentReceipt memory r = _receipt(id, escrowId);
        bytes memory proof = _proof(attesterKey, a.router.hashReceipt(r));
        vm.prank(relayer);
        a.router.settleIntent(r, proof);
        assertEq(a.usdc.balanceOf(relayer), 101e6 - 1.01e6);
        assertEq(a.usdc.balanceOf(treasury), 1.01e6);
        assertEq(uint8(a.router.getIntent(id).status), uint8(TrestlePaymentRouter.IntentStatus.Settled));

        // buyer (smart account on B) confirms delivery → seller paid on B
        vm.chainId(CHAIN_B);
        vm.prank(buyerAccountB);
        b.escrow.confirmDelivery(escrowId);
        assertEq(b.usdc.balanceOf(seller), 100e6);
        assertEq(b.loyalty.balanceOf(buyerAccountB), 5 ether);
    }

    function test_nativeSourceIntent() public {
        vm.chainId(CHAIN_A);
        vm.prank(buyer);
        bytes32 id = a.router.createIntent{value: 0.05 ether}(_params(address(0), 0.05 ether, 150e6));
        assertEq(address(a.router).balance, 0.05 ether);
        uint256 escrowId = _fulfill(_message(id));
        vm.chainId(CHAIN_A);
        TrestlePaymentRouter.FulfillmentReceipt memory r = _receipt(id, escrowId);
        bytes memory proof = _proof(attesterKey, a.router.hashReceipt(r));
        vm.prank(relayer);
        a.router.settleIntent(r, proof);
        assertEq(relayer.balance, 0.05 ether - 0.0005 ether);
        assertEq(treasury.balance, 0.0005 ether);
    }

    // --- replay & proof failures -----------------------------------------------------------------

    function test_fulfill_replayReverts() public {
        bytes32 id = _createIntent(101e6, 100e6);
        TrestlePaymentRouter.FulfillMessage memory m = _message(id);
        _fulfill(m);
        vm.chainId(CHAIN_B);
        bytes memory proof = _proof(attesterKey, b.router.hashFulfillMessage(m));
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(TrestlePaymentRouter.AlreadyFulfilled.selector, id));
        b.router.fulfillIntent(m, proof);
    }

    function test_fulfill_rejectsForgedSignature() public {
        bytes32 id = _createIntent(101e6, 100e6);
        TrestlePaymentRouter.FulfillMessage memory m = _message(id);
        vm.chainId(CHAIN_B);
        bytes memory proof = _proof(0xBAD, b.router.hashFulfillMessage(m));
        vm.prank(relayer);
        vm.expectRevert(TrestlePaymentRouter.InvalidProof.selector);
        b.router.fulfillIntent(m, proof);
    }

    function test_fulfill_rejectsTamperedAmount() public {
        bytes32 id = _createIntent(101e6, 100e6);
        TrestlePaymentRouter.FulfillMessage memory m = _message(id);
        vm.chainId(CHAIN_B);
        bytes memory proof = _proof(attesterKey, b.router.hashFulfillMessage(m));
        m.destAmount = 1e6; // relayer tries to underpay the seller
        vm.prank(relayer);
        vm.expectRevert(TrestlePaymentRouter.InvalidProof.selector);
        b.router.fulfillIntent(m, proof);
    }

    function test_fulfill_rejectsSignatureForOtherChainDomain() public {
        bytes32 id = _createIntent(101e6, 100e6);
        TrestlePaymentRouter.FulfillMessage memory m = _message(id);
        // attester signs the digest under chain A's domain; not valid on chain B
        vm.chainId(CHAIN_A);
        bytes32 wrongDigest = a.router.hashFulfillMessage(m);
        vm.chainId(CHAIN_B);
        bytes memory proof = _proof(attesterKey, wrongDigest);
        vm.prank(relayer);
        vm.expectRevert(TrestlePaymentRouter.InvalidProof.selector);
        b.router.fulfillIntent(m, proof);
    }

    function test_fulfill_rejectsUntrustedSourceAndForgedIntentId() public {
        bytes32 id = _createIntent(101e6, 100e6);
        TrestlePaymentRouter.FulfillMessage memory m = _message(id);
        m.sourceRouter = stranger;
        vm.chainId(CHAIN_B);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(TrestlePaymentRouter.UntrustedSource.selector, CHAIN_A, stranger));
        b.router.fulfillIntent(m, "");

        m = _message(id);
        m.nonce = 999;
        vm.prank(relayer);
        vm.expectRevert(TrestlePaymentRouter.IntentIdMismatch.selector);
        b.router.fulfillIntent(m, "");
    }

    function test_fulfill_insufficientLiquidity() public {
        bytes32 id = _createIntent(1_000e6, 6_000e6);
        TrestlePaymentRouter.FulfillMessage memory m = _message(id);
        vm.chainId(CHAIN_B);
        bytes memory proof = _proof(attesterKey, b.router.hashFulfillMessage(m));
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(TrestlePaymentRouter.InsufficientLiquidity.selector, 5_000e6, 6_000e6));
        b.router.fulfillIntent(m, proof);
    }

    function test_fulfill_rejectsExpired() public {
        bytes32 id = _createIntent(101e6, 100e6);
        TrestlePaymentRouter.FulfillMessage memory m = _message(id);
        vm.warp(m.expiry + 1);
        vm.chainId(CHAIN_B);
        bytes memory proof = _proof(attesterKey, b.router.hashFulfillMessage(m));
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(TrestlePaymentRouter.IntentExpired.selector, m.expiry));
        b.router.fulfillIntent(m, proof);
    }

    function test_fulfill_onlyRelayer() public {
        bytes32 id = _createIntent(101e6, 100e6);
        TrestlePaymentRouter.FulfillMessage memory m = _message(id);
        vm.chainId(CHAIN_B);
        bytes32 role = b.router.RELAYER_ROLE();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role));
        b.router.fulfillIntent(m, "");
    }

    function test_settle_rejectsDoubleSettleAndWrongReceipt() public {
        bytes32 id = _createIntent(101e6, 100e6);
        uint256 escrowId = _fulfill(_message(id));
        vm.chainId(CHAIN_A);
        TrestlePaymentRouter.FulfillmentReceipt memory r = _receipt(id, escrowId);
        r.destRouter = stranger;
        vm.prank(relayer);
        vm.expectRevert(TrestlePaymentRouter.ReceiptMismatch.selector);
        a.router.settleIntent(r, "");

        r = _receipt(id, escrowId);
        bytes memory proof = _proof(attesterKey, a.router.hashReceipt(r));
        vm.startPrank(relayer);
        a.router.settleIntent(r, proof);
        vm.expectRevert(
            abi.encodeWithSelector(
                TrestlePaymentRouter.InvalidIntentStatus.selector, TrestlePaymentRouter.IntentStatus.Settled
            )
        );
        a.router.settleIntent(r, proof);
        vm.stopPrank();
    }

    // --- refunds ---------------------------------------------------------------------------------

    function test_failIntent_refundsBuyer() public {
        bytes32 id = _createIntent(101e6, 100e6);
        vm.chainId(CHAIN_A);
        vm.prank(relayer);
        a.router.failIntent(id, "quote mismatch");
        assertEq(a.usdc.balanceOf(buyer), 1_000e6);
        assertEq(uint8(a.router.getIntent(id).status), uint8(TrestlePaymentRouter.IntentStatus.Failed));
    }

    function test_refundExpired_respectsGrace() public {
        bytes32 id = _createIntent(101e6, 100e6);
        TrestlePaymentRouter.Intent memory i = a.router.getIntent(id);
        vm.warp(i.expiry + 1);
        vm.expectRevert(
            abi.encodeWithSelector(TrestlePaymentRouter.NotYetRefundable.selector, uint256(i.expiry) + 30 minutes)
        );
        a.router.refundExpired(id);
        vm.warp(uint256(i.expiry) + 30 minutes + 1);
        vm.prank(stranger);
        a.router.refundExpired(id);
        assertEq(a.usdc.balanceOf(buyer), 1_000e6);
    }

    function test_createIntent_validation() public {
        vm.chainId(CHAIN_A);
        TrestlePaymentRouter.IntentParams memory p = _params(address(a.usdc), 10e6, 10e6);
        p.destChainId = 999;
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(TrestlePaymentRouter.UnsupportedDestination.selector, 999));
        a.router.createIntent(p);

        p = _params(address(a.usdc), 10e6, 10e6);
        p.expiry = uint64(block.timestamp + 1);
        vm.prank(buyer);
        vm.expectRevert(TrestlePaymentRouter.InvalidExpiry.selector);
        a.router.createIntent(p);

        p = _params(address(0), 1 ether, 10e6);
        vm.prank(buyer);
        vm.expectRevert(TrestlePaymentRouter.NativeValueMismatch.selector);
        a.router.createIntent{value: 0.5 ether}(p);
    }

    // --- same-chain checkout & loyalty discount --------------------------------------------------

    function test_checkoutDirect_appliesLoyaltyDiscount() public {
        vm.chainId(CHAIN_B);
        _fund(b.usdc, buyer, 1_000e6);
        vm.prank(buyer);
        b.usdc.approve(address(b.router), type(uint256).max);

        assertEq(b.router.quoteDirectFee(buyer, 100e6), 1e6);
        // stake 500 TRST → 25% discount on the protocol fee
        vm.prank(address(b.escrow));
        b.loyalty.mintReward(buyer, 500 ether);
        vm.prank(buyer);
        b.loyalty.stake(500 ether);
        assertEq(b.router.effectiveFeeBps(buyer), 75);
        assertEq(b.router.quoteDirectFee(buyer, 100e6), 0.75e6);

        vm.prank(buyer);
        uint256 escrowId = b.router.checkoutDirect(keccak256("o2"), address(b.usdc), 100e6, seller, buyerAccountB, 3 days);
        assertEq(b.usdc.balanceOf(buyer), 1_000e6 - 100.75e6);
        assertEq(b.usdc.balanceOf(treasury), 0.75e6);
        TrestleEscrow.Order memory o = b.escrow.getOrder(escrowId);
        assertEq(o.buyer, buyerAccountB);
        assertEq(o.amount, 100e6);
    }

    function test_withdrawLiquidity() public {
        vm.chainId(CHAIN_B);
        vm.startPrank(relayer);
        b.router.withdrawLiquidity(address(b.usdc), 1_000e6);
        assertEq(b.router.solverLiquidity(relayer, address(b.usdc)), 4_000e6);
        vm.expectRevert(
            abi.encodeWithSelector(TrestlePaymentRouter.InsufficientLiquidity.selector, 4_000e6, 4_001e6)
        );
        b.router.withdrawLiquidity(address(b.usdc), 4_001e6);
        vm.stopPrank();
    }
}

contract AttestationRelayerAdapterTest is TrestleBase {
    AttestationRelayerAdapter adapter;
    uint256 k1 = 0x1111;
    uint256 k2 = 0x2222;
    uint256 k3 = 0x3333;

    function setUp() public {
        address[] memory list = new address[](3);
        list[0] = vm.addr(k1);
        list[1] = vm.addr(k2);
        list[2] = vm.addr(k3);
        adapter = new AttestationRelayerAdapter(admin, list, 2);
    }

    function _sig(uint256 k, bytes32 d) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(k, d);
        return abi.encodePacked(r, s, v);
    }

    function _sorted(uint256 x, uint256 y, bytes32 d) internal pure returns (bytes[] memory sigs) {
        sigs = new bytes[](2);
        if (vm.addr(x) < vm.addr(y)) {
            sigs[0] = _sig(x, d);
            sigs[1] = _sig(y, d);
        } else {
            sigs[0] = _sig(y, d);
            sigs[1] = _sig(x, d);
        }
    }

    function test_thresholdSignaturesVerify() public view {
        bytes32 d = keccak256("msg");
        assertTrue(adapter.verify(d, abi.encode(_sorted(k1, k2, d))));
    }

    function test_rejectsDuplicateOrInsufficientSigners() public view {
        bytes32 d = keccak256("msg");
        bytes[] memory dup = new bytes[](2);
        dup[0] = _sig(k1, d);
        dup[1] = _sig(k1, d);
        assertFalse(adapter.verify(d, abi.encode(dup)));
        bytes[] memory one = new bytes[](1);
        one[0] = _sig(k1, d);
        assertFalse(adapter.verify(d, abi.encode(one)));
    }

    function test_rejectsNonAttester() public view {
        bytes32 d = keccak256("msg");
        assertFalse(adapter.verify(d, abi.encode(_sorted(k1, 0x9999, d))));
    }

    function test_thresholdCannotExceedAttesters() public {
        vm.prank(admin);
        vm.expectRevert(AttestationRelayerAdapter.InvalidThreshold.selector);
        adapter.setThreshold(4);
    }
}
