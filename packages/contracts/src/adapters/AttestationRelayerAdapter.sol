// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IRelayerAdapter} from "../interfaces/IRelayerAdapter.sol";

/// @title AttestationRelayerAdapter
/// @notice DEMO relayer adapter: a message is considered proven when at least `threshold` distinct,
///         registered attesters have ECDSA-signed its EIP-712 digest.
/// @dev TRUST MODEL: this is a trusted committee (1-of-1 in the default deployment), not a light client.
///      The digest is computed by the verifying router and is bound to that router's chain id and address
///      (EIP-712 domain), so a signature cannot be replayed on another chain or router. Swap this adapter
///      for a light-client / DVN / gateway adapter in production.
///      proof encoding: abi.encode(bytes[] signatures) with signers in strictly ascending address order.
contract AttestationRelayerAdapter is IRelayerAdapter, AccessControl {
    mapping(address => bool) public isAttester;
    uint256 public attesterCount;
    uint256 public threshold;

    event AttesterUpdated(address indexed attester, bool enabled);
    event ThresholdUpdated(uint256 threshold);

    error InvalidThreshold();

    constructor(address admin, address[] memory attesters, uint256 threshold_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        for (uint256 i; i < attesters.length; ++i) {
            _setAttester(attesters[i], true);
        }
        _setThreshold(threshold_);
    }

    function verify(bytes32 digest, bytes calldata proof) external view returns (bool) {
        bytes[] memory sigs = abi.decode(proof, (bytes[]));
        if (sigs.length < threshold) return false;
        address last;
        uint256 valid;
        for (uint256 i; i < sigs.length; ++i) {
            (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, sigs[i]);
            if (err != ECDSA.RecoverError.NoError || signer <= last || !isAttester[signer]) return false;
            last = signer;
            ++valid;
        }
        return valid >= threshold;
    }

    function adapterKind() external pure returns (string memory) {
        return "attestation-committee-demo";
    }

    function setAttester(address attester, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setAttester(attester, enabled);
        if (threshold > attesterCount) revert InvalidThreshold();
    }

    function setThreshold(uint256 threshold_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setThreshold(threshold_);
    }

    function _setAttester(address attester, bool enabled) internal {
        if (isAttester[attester] == enabled) return;
        isAttester[attester] = enabled;
        if (enabled) attesterCount++;
        else attesterCount--;
        emit AttesterUpdated(attester, enabled);
    }

    function _setThreshold(uint256 threshold_) internal {
        if (threshold_ == 0 || threshold_ > attesterCount) revert InvalidThreshold();
        threshold = threshold_;
        emit ThresholdUpdated(threshold_);
    }
}
