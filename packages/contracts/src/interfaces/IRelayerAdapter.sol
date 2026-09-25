// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IRelayerAdapter
/// @notice Pluggable verification of cross-chain messages for TrestlePaymentRouter.
/// @dev The router computes an EIP-712 digest that is bound to the *verifying* chain id and router
///      address, then asks the adapter whether `proof` attests to it. A production adapter could verify
///      a Union/IBC light-client proof, a LayerZero DVN attestation or an Axelar gateway approval; the
///      router does not change. The bundled `AttestationRelayerAdapter` is a trusted k-of-n signer
///      committee used for the demo.
interface IRelayerAdapter {
    /// @return valid true if `proof` authenticates `digest`.
    function verify(bytes32 digest, bytes calldata proof) external view returns (bool valid);

    /// @return a short human-readable identifier (shown in the transparency dashboard).
    function adapterKind() external view returns (string memory);
}
