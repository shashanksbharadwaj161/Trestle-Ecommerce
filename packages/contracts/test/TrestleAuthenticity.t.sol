// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TrestleAuthenticity} from "../src/TrestleAuthenticity.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract TrestleAuthenticityTest is Test {
    TrestleAuthenticity cert;
    address admin = makeAddr("admin");
    address seller = makeAddr("seller");
    address buyer = makeAddr("buyer");
    address reseller = makeAddr("reseller");

    function setUp() public {
        cert = new TrestleAuthenticity(admin);
        bytes32 role = cert.SELLER_ROLE();
        vm.prank(admin);
        cert.grantRole(role, seller);
    }

    function test_mintCertificate_recordsDetailsAndHistory() public {
        vm.prank(seller);
        uint256 id = cert.mintCertificateWithDetails(
            seller, "prod_123", "Acme Watches", "BATCH-7/SN-0001", "ipfs://meta"
        );
        TrestleAuthenticity.Certificate memory c = cert.getCertificate(id);
        assertEq(c.productId, "prod_123");
        assertEq(c.manufacturer, "Acme Watches");
        assertEq(c.batch, "BATCH-7/SN-0001");
        assertEq(c.originalSeller, seller);
        assertEq(c.mintedAt, block.timestamp);
        assertEq(cert.tokenURI(id), "ipfs://meta");
        TrestleAuthenticity.TransferRecord[] memory h = cert.getHistory(id);
        assertEq(h.length, 1);
        assertEq(h[0].from, address(0));
        assertEq(h[0].to, seller);
    }

    function test_provenanceTracksResale() public {
        vm.prank(seller);
        uint256 id = cert.mintCertificate(seller, "prod_1", "ipfs://x");
        vm.warp(block.timestamp + 1 days);
        vm.prank(seller);
        cert.transferFrom(seller, buyer, id);
        vm.warp(block.timestamp + 30 days);
        vm.prank(buyer);
        cert.transferFrom(buyer, reseller, id);
        TrestleAuthenticity.TransferRecord[] memory h = cert.getHistory(id);
        assertEq(h.length, 3);
        assertEq(h[1].from, seller);
        assertEq(h[1].to, buyer);
        assertEq(h[2].to, reseller);
        assertGt(h[2].timestamp, h[1].timestamp);
        // original seller is immutable
        assertEq(cert.getCertificate(id).originalSeller, seller);
    }

    function test_mint_onlySeller() public {
        bytes32 role = cert.SELLER_ROLE();
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, buyer, role)
        );
        cert.mintCertificate(buyer, "fake", "ipfs://counterfeit");
    }

    function test_mint_rejectsEmptyProductAndZeroAddress() public {
        vm.startPrank(seller);
        vm.expectRevert(TrestleAuthenticity.EmptyProductId.selector);
        cert.mintCertificate(seller, "", "uri");
        vm.expectRevert(TrestleAuthenticity.ZeroAddress.selector);
        cert.mintCertificate(address(0), "p", "uri");
        vm.stopPrank();
    }

    function test_getHistory_unknownTokenReverts() public {
        vm.expectRevert();
        cert.getHistory(42);
    }
}
