// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title TrestleAuthenticity
/// @notice ERC-721 authenticity certificates. Each certificate records the product id, manufacturer,
///         batch/serial, mint timestamp and original listing seller, plus an append-only on-chain
///         provenance log of every transfer (including the mint).
contract TrestleAuthenticity is ERC721, AccessControl {
    bytes32 public constant SELLER_ROLE = keccak256("SELLER_ROLE");

    struct Certificate {
        string productId;
        string manufacturer;
        string batch;
        string metadataURI;
        address originalSeller;
        uint64 mintedAt;
    }

    struct TransferRecord {
        address from;
        address to;
        uint64 timestamp;
        uint64 blockNumber;
    }

    uint256 public totalSupply;
    mapping(uint256 tokenId => Certificate) private _certificates;
    mapping(uint256 tokenId => TransferRecord[]) private _history;

    event CertificateMinted(
        uint256 indexed tokenId, address indexed seller, address indexed to, string productId, string batch
    );
    event ProvenanceRecorded(uint256 indexed tokenId, address indexed from, address indexed to, uint64 timestamp);

    error EmptyProductId();
    error ZeroAddress();

    constructor(address admin) ERC721("Trestle Authenticity Certificate", "TCERT") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function mintCertificate(address to, string calldata productId, string calldata metadataURI)
        external
        onlyRole(SELLER_ROLE)
        returns (uint256)
    {
        return _mintCertificate(to, productId, "", "", metadataURI);
    }

    function mintCertificateWithDetails(
        address to,
        string calldata productId,
        string calldata manufacturer,
        string calldata batch,
        string calldata metadataURI
    ) external onlyRole(SELLER_ROLE) returns (uint256) {
        return _mintCertificate(to, productId, manufacturer, batch, metadataURI);
    }

    function _mintCertificate(
        address to,
        string calldata productId,
        string memory manufacturer,
        string memory batch,
        string calldata metadataURI
    ) internal returns (uint256 tokenId) {
        if (to == address(0)) revert ZeroAddress();
        if (bytes(productId).length == 0) revert EmptyProductId();
        tokenId = ++totalSupply;
        _certificates[tokenId] = Certificate({
            productId: productId,
            manufacturer: manufacturer,
            batch: batch,
            metadataURI: metadataURI,
            originalSeller: msg.sender,
            mintedAt: uint64(block.timestamp)
        });
        _safeMint(to, tokenId);
        emit CertificateMinted(tokenId, msg.sender, to, productId, batch);
    }

    function getCertificate(uint256 tokenId) external view returns (Certificate memory) {
        _requireOwned(tokenId);
        return _certificates[tokenId];
    }

    function getHistory(uint256 tokenId) external view returns (TransferRecord[] memory) {
        _requireOwned(tokenId);
        return _history[tokenId];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _certificates[tokenId].metadataURI;
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        uint64 ts = uint64(block.timestamp);
        _history[tokenId].push(TransferRecord({from: from, to: to, timestamp: ts, blockNumber: uint64(block.number)}));
        emit ProvenanceRecorded(tokenId, from, to, ts);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
