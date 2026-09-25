// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ReputationEventType} from "./interfaces/ITrestle.sol";

/// @notice ERC-5192 minimal soulbound interface.
interface IERC5192 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);

    function locked(uint256 tokenId) external view returns (bool);
}

/// @title TrestleReputation
/// @notice Soulbound (ERC-5192) reputation token. One token per account, minted lazily on the first
///         recorded event. The score is a time-decayed sum of event weights.
/// @dev Only accounts with RECORDER_ROLE (TrestleEscrow) can record events. Transfers and approvals revert.
///      Decay: score halves every `halfLife` seconds; within a half-life period the decay is linearly
///      interpolated (max error ≈ 6% vs. true exponential), which keeps `getScore` cheap and exact-integer.
contract TrestleReputation is ERC721, AccessControl, IERC5192 {
    using Strings for uint256;

    bytes32 public constant RECORDER_ROLE = keccak256("RECORDER_ROLE");
    int256 public constant SCALE = 1e18;

    struct Reputation {
        uint256 tokenId;
        int256 score; // scaled by SCALE, as of lastUpdated
        uint64 lastUpdated;
        uint32 positiveEvents;
        uint32 negativeEvents;
    }

    uint256 public immutable halfLife;
    uint256 public totalSupply;
    mapping(address account => Reputation) private _reputation;

    event ReputationEventRecorded(
        address indexed user,
        ReputationEventType indexed eventType,
        int256 weight,
        int256 newScore,
        uint256 tokenId
    );
    /// @dev ERC-4906 metadata refresh signal.
    event MetadataUpdate(uint256 _tokenId);

    error Soulbound();
    error ZeroAddress();
    error NoToken();

    constructor(address admin, uint256 halfLife_) ERC721("Trestle Reputation", "TREP") {
        if (admin == address(0)) revert ZeroAddress();
        require(halfLife_ > 0, "halfLife");
        halfLife = halfLife_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ---------------------------------------------------------------------------------------------
    // Recording
    // ---------------------------------------------------------------------------------------------

    function recordEvent(address user, ReputationEventType eventType, int256 weight)
        external
        onlyRole(RECORDER_ROLE)
    {
        if (user == address(0)) revert ZeroAddress();
        Reputation storage rep = _reputation[user];
        if (rep.tokenId == 0) {
            uint256 tokenId = ++totalSupply;
            rep.tokenId = tokenId;
            _safeMintSoulbound(user, tokenId);
        }
        int256 current = _decayed(rep.score, rep.lastUpdated);
        int256 updated = current + weight * SCALE;
        rep.score = updated;
        rep.lastUpdated = uint64(block.timestamp);
        if (weight >= 0) rep.positiveEvents += 1;
        else rep.negativeEvents += 1;

        emit ReputationEventRecorded(user, eventType, weight, updated, rep.tokenId);
        emit MetadataUpdate(rep.tokenId);
    }

    function _safeMintSoulbound(address to, uint256 tokenId) private {
        _mint(to, tokenId);
        emit Locked(tokenId);
    }

    // ---------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------

    /// @return score decayed reputation score scaled by 1e18 (may be negative).
    function getScore(address user) external view returns (int256) {
        Reputation storage rep = _reputation[user];
        return _decayed(rep.score, rep.lastUpdated);
    }

    function getReputation(address user)
        external
        view
        returns (
            uint256 tokenId,
            int256 score,
            uint64 lastUpdated,
            uint32 positiveEvents,
            uint32 negativeEvents
        )
    {
        Reputation storage rep = _reputation[user];
        return (
            rep.tokenId,
            _decayed(rep.score, rep.lastUpdated),
            rep.lastUpdated,
            rep.positiveEvents,
            rep.negativeEvents
        );
    }

    function tokenOf(address user) external view returns (uint256) {
        return _reputation[user].tokenId;
    }

    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        address owner = _requireOwned(tokenId);
        Reputation storage rep = _reputation[owner];
        int256 score = _decayed(rep.score, rep.lastUpdated) / SCALE;
        string memory scoreStr =
            score < 0 ? string.concat("-", uint256(-score).toString()) : uint256(score).toString();
        bytes memory json = abi.encodePacked(
            '{"name":"Trestle Reputation #',
            tokenId.toString(),
            '","description":"Soulbound, non-transferable Trestle marketplace reputation.","attributes":[',
            '{"trait_type":"score","value":',
            scoreStr,
            '},{"trait_type":"positive_events","value":',
            uint256(rep.positiveEvents).toString(),
            '},{"trait_type":"negative_events","value":',
            uint256(rep.negativeEvents).toString(),
            "}]}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }

    function _decayed(int256 score, uint64 lastUpdated) internal view returns (int256) {
        if (score == 0 || lastUpdated == 0) return score;
        uint256 elapsed = block.timestamp - lastUpdated;
        uint256 periods = elapsed / halfLife;
        if (periods >= 128) return 0;
        int256 s = score / int256(uint256(1) << periods);
        uint256 remainder = elapsed % halfLife;
        // linear interpolation of 2^(-r/H) ≈ 1 - r/(2H)
        s -= (s * int256(remainder)) / int256(2 * halfLife);
        return s;
    }

    // ---------------------------------------------------------------------------------------------
    // Soulbound enforcement
    // ---------------------------------------------------------------------------------------------

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        if (from != address(0) && to == address(0)) revert Soulbound(); // no burning either
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return interfaceId == 0xb45a3c0e // ERC-5192
            || interfaceId == 0x49064906 // ERC-4906
            || super.supportsInterface(interfaceId);
    }
}
