// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IRelayerAdapter} from "./interfaces/IRelayerAdapter.sol";
import {ITrestleEscrow, ITrestleLoyalty} from "./interfaces/ITrestle.sol";

/// @title TrestlePaymentRouter
/// @notice Cross-chain settlement abstraction, deployed on every supported chain. It plays two roles:
///
///  SOURCE side (buyer's chain)
///   - `createIntent` locks the buyer's funds and emits `IntentCreated`.
///   - `settleIntent` repays the solver from the locked funds once the adapter proves the intent was
///     fulfilled on the destination chain; `failIntent` / `refundExpired` return funds to the buyer.
///
///  DESTINATION side (seller's payout chain)
///   - `fulfillIntent` is called by a registered relayer with a proof of the source-chain intent. It pays
///     the seller's escrow out of the *solver's pre-deposited destination liquidity* and emits
///     `IntentFulfilled`.
///
/// No asset ever "teleports": the destination escrow is funded with liquidity that already exists on the
/// destination chain, and the solver is reimbursed on the source chain. This is the standard intent/solver
/// model (cf. ERC-7683). Message authenticity is delegated to an `IRelayerAdapter`.
///
///  SAME-CHAIN checkout (`checkoutDirect`) routes the buyer's payment straight into the local escrow.
contract TrestlePaymentRouter is AccessControl, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant SOLVER_ROLE = keccak256("SOLVER_ROLE");
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_FEE_BPS = 500;
    uint64 public constant MIN_INTENT_TTL = 5 minutes;
    uint64 public constant MAX_INTENT_TTL = 7 days;
    /// @notice buyers may reclaim an unfulfilled intent only after expiry + grace, while the destination
    ///         rejects fulfilment after expiry. The grace absorbs clock skew between chains.
    uint64 public constant REFUND_GRACE = 30 minutes;

    bytes32 public constant FULFILL_TYPEHASH = keccak256(
        "FulfillMessage(bytes32 intentId,uint256 nonce,uint256 sourceChainId,address sourceRouter,uint256 destChainId,address buyer,address seller,address destToken,uint256 destAmount,bytes32 orderRef,uint64 deliveryWindow,uint64 expiry)"
    );
    bytes32 public constant RECEIPT_TYPEHASH = keccak256(
        "FulfillmentReceipt(bytes32 intentId,uint256 destChainId,address destRouter,uint256 escrowOrderId,address solver)"
    );

    enum IntentStatus {
        None,
        Created,
        Settled,
        Failed
    }

    struct IntentParams {
        bytes32 orderRef;
        address sourceToken; // address(0) = native
        uint256 sourceAmount; // total paid by buyer, protocol fee included
        uint256 destChainId;
        address destToken;
        uint256 destAmount; // exact amount the seller's escrow must receive
        address seller;
        address destBuyer; // buyer's account on the destination chain (e.g. ERC-4337 smart account)
        uint64 deliveryWindow;
        uint64 expiry;
    }

    struct Intent {
        address buyer;
        address sourceToken;
        uint256 sourceAmount;
        uint256 fee;
        uint256 destChainId;
        address destToken;
        uint256 destAmount;
        address seller;
        address destBuyer;
        bytes32 orderRef;
        uint64 deliveryWindow;
        uint64 expiry;
        uint256 nonce;
        IntentStatus status;
    }

    struct FulfillMessage {
        bytes32 intentId;
        uint256 nonce;
        uint256 sourceChainId;
        address sourceRouter;
        uint256 destChainId;
        address buyer;
        address seller;
        address destToken;
        uint256 destAmount;
        bytes32 orderRef;
        uint64 deliveryWindow;
        uint64 expiry;
    }

    struct FulfillmentReceipt {
        bytes32 intentId;
        uint256 destChainId;
        address destRouter;
        uint256 escrowOrderId;
        address solver;
    }

    ITrestleEscrow public escrow;
    ITrestleLoyalty public loyalty;
    IRelayerAdapter public adapter;
    address public treasury;
    uint256 public protocolFeeBps;

    uint256 public intentNonce;
    mapping(bytes32 intentId => Intent) private _intents;
    mapping(uint256 chainId => address router) public remoteRouters;

    // destination side
    mapping(bytes32 intentId => uint256 escrowOrderId) public fulfilledIntents; // 0 = not fulfilled
    mapping(address solver => mapping(address token => uint256)) public solverLiquidity;
    mapping(address token => uint256) public totalLiquidity;

    event IntentCreated(
        bytes32 indexed intentId,
        address indexed buyer,
        bytes32 indexed orderRef,
        uint256 nonce,
        address sourceToken,
        uint256 sourceAmount,
        uint256 fee,
        uint256 destChainId,
        address destToken,
        uint256 destAmount,
        address seller,
        address destBuyer,
        uint64 deliveryWindow,
        uint64 expiry
    );
    event IntentFulfilled(
        bytes32 indexed intentId,
        uint256 indexed sourceChainId,
        uint256 indexed escrowOrderId,
        address solver,
        address destToken,
        uint256 destAmount,
        bytes32 orderRef
    );
    event IntentSettled(
        bytes32 indexed intentId,
        address indexed solver,
        uint256 escrowOrderId,
        uint256 paidToSolver,
        uint256 fee
    );
    event IntentFailed(bytes32 indexed intentId, address indexed buyer, uint256 refunded, string reason);
    event DirectCheckout(
        bytes32 indexed orderRef,
        address indexed buyer,
        uint256 indexed escrowOrderId,
        address token,
        uint256 amount,
        uint256 fee
    );
    event LiquidityDeposited(address indexed solver, address indexed token, uint256 amount);
    event LiquidityWithdrawn(address indexed solver, address indexed token, uint256 amount);
    event RemoteRouterSet(uint256 indexed chainId, address router);
    event ConfigUpdated(
        address escrow, address loyalty, address adapter, address treasury, uint256 protocolFeeBps
    );

    error UnsupportedDestination(uint256 chainId);
    error UntrustedSource(uint256 chainId, address router);
    error InvalidExpiry();
    error InvalidAmount();
    error InvalidIntentStatus(IntentStatus status);
    error AlreadyFulfilled(bytes32 intentId);
    error IntentExpired(uint64 expiry);
    error NotYetRefundable(uint256 availableAt);
    error InvalidProof();
    error IntentIdMismatch();
    error WrongChain();
    error ReceiptMismatch();
    error InsufficientLiquidity(uint256 available, uint256 required);
    error NativeValueMismatch();
    error NativeTransferFailed();
    error ZeroAddress();
    error FeeTooHigh();

    constructor(address admin, address treasury_, uint256 protocolFeeBps_)
        EIP712("TrestlePaymentRouter", "1")
    {
        if (admin == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        if (protocolFeeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        treasury = treasury_;
        protocolFeeBps = protocolFeeBps_;
    }

    // =============================================================================================
    // Fees
    // =============================================================================================

    /// @notice Effective protocol fee (bps) for `buyer` after the loyalty staking discount on this chain.
    function effectiveFeeBps(address buyer) public view returns (uint256) {
        uint256 discount;
        if (address(loyalty) != address(0)) {
            try loyalty.feeDiscountBps(buyer) returns (uint256 d) {
                discount = d > BPS ? BPS : d;
            } catch {}
        }
        return (protocolFeeBps * (BPS - discount)) / BPS;
    }

    // =============================================================================================
    // Source side
    // =============================================================================================

    function createIntent(IntentParams calldata p) external payable nonReentrant returns (bytes32 intentId) {
        if (p.destChainId == block.chainid || remoteRouters[p.destChainId] == address(0)) {
            revert UnsupportedDestination(p.destChainId);
        }
        if (p.expiry < block.timestamp + MIN_INTENT_TTL || p.expiry > block.timestamp + MAX_INTENT_TTL) {
            revert InvalidExpiry();
        }
        if (p.sourceAmount == 0 || p.destAmount == 0) revert InvalidAmount();
        if (p.seller == address(0) || p.destBuyer == address(0)) revert ZeroAddress();

        _pullExact(p.sourceToken, msg.sender, p.sourceAmount);

        uint256 fee = (p.sourceAmount * effectiveFeeBps(msg.sender)) / BPS;
        uint256 nonce = ++intentNonce;
        intentId = computeIntentId(block.chainid, address(this), nonce);
        _intents[intentId] = Intent({
            buyer: msg.sender,
            sourceToken: p.sourceToken,
            sourceAmount: p.sourceAmount,
            fee: fee,
            destChainId: p.destChainId,
            destToken: p.destToken,
            destAmount: p.destAmount,
            seller: p.seller,
            destBuyer: p.destBuyer,
            orderRef: p.orderRef,
            deliveryWindow: p.deliveryWindow,
            expiry: p.expiry,
            nonce: nonce,
            status: IntentStatus.Created
        });
        _emitIntentCreated(intentId);
    }

    function _emitIntentCreated(bytes32 intentId) private {
        Intent storage i = _intents[intentId];
        emit IntentCreated(
            intentId,
            i.buyer,
            i.orderRef,
            i.nonce,
            i.sourceToken,
            i.sourceAmount,
            i.fee,
            i.destChainId,
            i.destToken,
            i.destAmount,
            i.seller,
            i.destBuyer,
            i.deliveryWindow,
            i.expiry
        );
    }

    /// @notice Repay the solver after the adapter proves fulfilment on the destination chain.
    function settleIntent(FulfillmentReceipt calldata r, bytes calldata proof)
        external
        onlyRole(RELAYER_ROLE)
        nonReentrant
    {
        Intent storage i = _intents[r.intentId];
        if (i.status != IntentStatus.Created) revert InvalidIntentStatus(i.status);
        if (r.destChainId != i.destChainId || r.destRouter != remoteRouters[i.destChainId]) {
            revert ReceiptMismatch();
        }
        if (r.solver == address(0) || r.escrowOrderId == 0) revert ReceiptMismatch();
        if (!adapter.verify(hashReceipt(r), proof)) revert InvalidProof();

        i.status = IntentStatus.Settled;
        uint256 toSolver = i.sourceAmount - i.fee;
        emit IntentSettled(r.intentId, r.solver, r.escrowOrderId, toSolver, i.fee);
        _send(i.sourceToken, r.solver, toSolver);
        if (i.fee > 0) _send(i.sourceToken, treasury, i.fee);
    }

    /// @notice Relayer rejects an intent it cannot fulfil (bad quote, no liquidity…); buyer is refunded in full.
    function failIntent(bytes32 intentId, string calldata reason)
        external
        onlyRole(RELAYER_ROLE)
        nonReentrant
    {
        _refund(intentId, reason);
    }

    /// @notice Anyone may refund an intent that was never settled once expiry + grace has passed.
    function refundExpired(bytes32 intentId) external nonReentrant {
        Intent storage i = _intents[intentId];
        if (i.status != IntentStatus.Created) revert InvalidIntentStatus(i.status);
        uint256 availableAt = uint256(i.expiry) + REFUND_GRACE;
        if (block.timestamp <= availableAt) revert NotYetRefundable(availableAt);
        _refund(intentId, "expired");
    }

    function _refund(bytes32 intentId, string memory reason) internal {
        Intent storage i = _intents[intentId];
        if (i.status != IntentStatus.Created) revert InvalidIntentStatus(i.status);
        i.status = IntentStatus.Failed;
        emit IntentFailed(intentId, i.buyer, i.sourceAmount, reason);
        _send(i.sourceToken, i.buyer, i.sourceAmount);
    }

    // =============================================================================================
    // Destination side
    // =============================================================================================

    function fulfillIntent(FulfillMessage calldata m, bytes calldata proof)
        external
        onlyRole(RELAYER_ROLE)
        nonReentrant
        returns (uint256 escrowOrderId)
    {
        if (m.destChainId != block.chainid) revert WrongChain();
        if (
            m.sourceChainId == block.chainid || remoteRouters[m.sourceChainId] != m.sourceRouter
                || m.sourceRouter == address(0)
        ) {
            revert UntrustedSource(m.sourceChainId, m.sourceRouter);
        }
        if (computeIntentId(m.sourceChainId, m.sourceRouter, m.nonce) != m.intentId) {
            revert IntentIdMismatch();
        }
        if (fulfilledIntents[m.intentId] != 0) revert AlreadyFulfilled(m.intentId);
        if (block.timestamp > m.expiry) revert IntentExpired(m.expiry);
        if (!adapter.verify(hashFulfillMessage(m), proof)) revert InvalidProof();

        uint256 available = solverLiquidity[msg.sender][m.destToken];
        if (available < m.destAmount) revert InsufficientLiquidity(available, m.destAmount);
        solverLiquidity[msg.sender][m.destToken] = available - m.destAmount;
        totalLiquidity[m.destToken] -= m.destAmount;

        escrowOrderId =
            _fundEscrow(m.buyer, m.seller, m.destToken, m.destAmount, m.deliveryWindow, m.orderRef);
        fulfilledIntents[m.intentId] = escrowOrderId;
        emit IntentFulfilled(
            m.intentId, m.sourceChainId, escrowOrderId, msg.sender, m.destToken, m.destAmount, m.orderRef
        );
    }

    function depositLiquidity(address token, uint256 amount)
        external
        payable
        onlyRole(SOLVER_ROLE)
        nonReentrant
    {
        if (amount == 0) revert InvalidAmount();
        _pullExact(token, msg.sender, amount);
        solverLiquidity[msg.sender][token] += amount;
        totalLiquidity[token] += amount;
        emit LiquidityDeposited(msg.sender, token, amount);
    }

    function withdrawLiquidity(address token, uint256 amount) external nonReentrant {
        uint256 available = solverLiquidity[msg.sender][token];
        if (amount == 0 || amount > available) revert InsufficientLiquidity(available, amount);
        solverLiquidity[msg.sender][token] = available - amount;
        totalLiquidity[token] -= amount;
        emit LiquidityWithdrawn(msg.sender, token, amount);
        _send(token, msg.sender, amount);
    }

    // =============================================================================================
    // Same-chain checkout
    // =============================================================================================

    /// @notice Buyer pays `escrowAmount + fee` on the seller's payout chain; escrow receives exactly
    ///         `escrowAmount`, the (loyalty-discounted) fee goes to the treasury.
    function checkoutDirect(
        bytes32 orderRef,
        address token,
        uint256 escrowAmount,
        address seller,
        address buyerAccount,
        uint64 deliveryWindow
    ) external payable nonReentrant returns (uint256 escrowOrderId) {
        if (escrowAmount == 0) revert InvalidAmount();
        address buyer = buyerAccount == address(0) ? msg.sender : buyerAccount;
        uint256 fee = quoteDirectFee(msg.sender, escrowAmount);
        _pullExact(token, msg.sender, escrowAmount + fee);
        escrowOrderId = _fundEscrow(buyer, seller, token, escrowAmount, deliveryWindow, orderRef);
        if (fee > 0) _send(token, treasury, fee);
        emit DirectCheckout(orderRef, buyer, escrowOrderId, token, escrowAmount + fee, fee);
    }

    function _fundEscrow(
        address buyer,
        address seller,
        address token,
        uint256 amount,
        uint64 deliveryWindow,
        bytes32 orderRef
    ) private returns (uint256) {
        uint64 deadline = uint64(block.timestamp) + deliveryWindow;
        if (token == address(0)) {
            return escrow.createOrderFor{value: amount}(buyer, seller, token, amount, deadline, orderRef);
        }
        IERC20(token).forceApprove(address(escrow), amount);
        return escrow.createOrderFor(buyer, seller, token, amount, deadline, orderRef);
    }

    function quoteDirectFee(address payer, uint256 escrowAmount) public view returns (uint256) {
        return (escrowAmount * effectiveFeeBps(payer)) / BPS;
    }

    // =============================================================================================
    // Hashing & views
    // =============================================================================================

    function computeIntentId(uint256 sourceChainId, address sourceRouter, uint256 nonce)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(sourceChainId, sourceRouter, nonce));
    }

    function hashFulfillMessage(FulfillMessage calldata m) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    FULFILL_TYPEHASH,
                    m.intentId,
                    m.nonce,
                    m.sourceChainId,
                    m.sourceRouter,
                    m.destChainId,
                    m.buyer,
                    m.seller,
                    m.destToken,
                    m.destAmount,
                    m.orderRef,
                    m.deliveryWindow,
                    m.expiry
                )
            )
        );
    }

    function hashReceipt(FulfillmentReceipt calldata r) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    RECEIPT_TYPEHASH, r.intentId, r.destChainId, r.destRouter, r.escrowOrderId, r.solver
                )
            )
        );
    }

    function getIntent(bytes32 intentId) external view returns (Intent memory) {
        return _intents[intentId];
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // =============================================================================================
    // Admin
    // =============================================================================================

    function setConfig(address escrow_, address loyalty_, address adapter_, address treasury_, uint256 feeBps)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (treasury_ == address(0) || adapter_ == address(0) || escrow_ == address(0)) revert ZeroAddress();
        if (feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        escrow = ITrestleEscrow(escrow_);
        loyalty = ITrestleLoyalty(loyalty_);
        adapter = IRelayerAdapter(adapter_);
        treasury = treasury_;
        protocolFeeBps = feeBps;
        emit ConfigUpdated(escrow_, loyalty_, adapter_, treasury_, feeBps);
    }

    function setRemoteRouter(uint256 chainId, address router) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (chainId == block.chainid) revert UnsupportedDestination(chainId);
        remoteRouters[chainId] = router;
        emit RemoteRouterSet(chainId, router);
    }

    // =============================================================================================
    // Token movement
    // =============================================================================================

    function _pullExact(address token, address from, uint256 amount) internal {
        if (token == address(0)) {
            if (msg.value != amount) revert NativeValueMismatch();
            return;
        }
        if (msg.value != 0) revert NativeValueMismatch();
        uint256 beforeBal = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(from, address(this), amount);
        if (IERC20(token).balanceOf(address(this)) - beforeBal != amount) revert InvalidAmount();
    }

    function _send(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert NativeTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
