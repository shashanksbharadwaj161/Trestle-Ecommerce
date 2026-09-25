// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TrestleEscrow} from "../src/TrestleEscrow.sol";
import {TrestleReputation} from "../src/TrestleReputation.sol";
import {TrestleLoyalty} from "../src/TrestleLoyalty.sol";
import {TrestleAuthenticity} from "../src/TrestleAuthenticity.sol";
import {TrestlePaymentRouter} from "../src/TrestlePaymentRouter.sol";
import {TrestlePaymaster} from "../src/TrestlePaymaster.sol";
import {AttestationRelayerAdapter} from "../src/adapters/AttestationRelayerAdapter.sol";
import {TestToken} from "../src/mocks/TestToken.sol";
import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {SimpleAccountFactory} from "@account-abstraction/contracts/samples/SimpleAccountFactory.sol";

/// @notice Deploys and wires the full Trestle stack on ONE chain and writes the addresses to
///         `packages/shared/src/addresses/deployments/<chainId>.json`.
///         Run once per chain; cross-chain router wiring + solver liquidity are done afterwards
///         (see script/deploy-local.sh / deploy-testnet.sh).
///
/// Required env: DEPLOYER_PRIVATE_KEY, RELAYER_ADDRESS
/// Optional env: ATTESTER_ADDRESS (defaults to relayer), ARBITER_ADDRESS, TREASURY_ADDRESS, PROTOCOL_FEE_BPS,
///               PAYMASTER_DAILY_CAP_WEI, PAYMASTER_DEPOSIT_WEI, PAYMASTER_STAKE_WEI, SELLER_ADDRESSES (comma list),
///               BUNDLER_ADDRESS, SOLVER_TOKEN_MINT (whole tokens minted to the relayer for liquidity)
contract Deploy is Script {
    address constant CANONICAL_ENTRYPOINT_V07 = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    struct Deployed {
        address usdc;
        address dai;
        address escrow;
        address reputation;
        address loyalty;
        address authenticity;
        address adapter;
        address router;
        address entryPoint;
        address accountFactory;
        address paymaster;
    }

    struct Cfg {
        uint256 pk;
        address deployer;
        address relayer;
        address attester;
        address arbiter;
        address treasury;
        uint256 feeBps;
        uint256 capWei;
        uint256 depositWei;
        uint256 stakeWei;
        uint256 solverMint;
        address[] sellers;
    }

    function _cfg() internal view returns (Cfg memory c) {
        c.pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        c.deployer = vm.addr(c.pk);
        c.relayer = vm.envAddress("RELAYER_ADDRESS");
        c.attester = vm.envOr("ATTESTER_ADDRESS", c.relayer);
        c.arbiter = vm.envOr("ARBITER_ADDRESS", c.deployer);
        c.treasury = vm.envOr("TREASURY_ADDRESS", c.deployer);
        c.feeBps = vm.envOr("PROTOCOL_FEE_BPS", uint256(100));
        c.capWei = vm.envOr("PAYMASTER_DAILY_CAP_WEI", uint256(0.02 ether));
        c.depositWei = vm.envOr("PAYMASTER_DEPOSIT_WEI", uint256(1 ether));
        c.stakeWei = vm.envOr("PAYMASTER_STAKE_WEI", uint256(0.01 ether));
        c.solverMint = vm.envOr("SOLVER_TOKEN_MINT", uint256(1_000_000));
        c.sellers = vm.envOr("SELLER_ADDRESSES", ",", new address[](0));
    }

    function run() external returns (Deployed memory d) {
        Cfg memory c = _cfg();
        vm.startBroadcast(c.pk);
        _deployTokens(c, d);
        _deployCore(c, d);
        _deployAccountAbstraction(c, d);
        vm.stopBroadcast();
        _write(d, c);
    }

    function _deployTokens(Cfg memory c, Deployed memory d) internal {
        d.usdc = address(new TestToken("Trestle Test USD Coin", "tUSDC", 6, 1_000e6, c.deployer));
        d.dai = address(new TestToken("Trestle Test Dai", "tDAI", 18, 1_000e18, c.deployer));
        // demo solver inventory (test tokens only)
        if (c.solverMint > 0) {
            TestToken(d.usdc).mint(c.relayer, c.solverMint * 1e6);
            TestToken(d.dai).mint(c.relayer, c.solverMint * 1e18);
        }
    }

    function _deployCore(Cfg memory c, Deployed memory d) internal {
        TrestleEscrow escrow = new TrestleEscrow(c.deployer);
        TrestleReputation reputation = new TrestleReputation(c.deployer, 180 days);
        TrestleLoyalty loyalty = new TrestleLoyalty(c.deployer, 800);
        address[] memory attesters = new address[](1);
        attesters[0] = c.attester;
        d.adapter = address(new AttestationRelayerAdapter(c.deployer, attesters, 1));
        TrestlePaymentRouter router = new TrestlePaymentRouter(c.deployer, c.treasury, c.feeBps);

        router.setConfig(address(escrow), address(loyalty), d.adapter, c.treasury, c.feeBps);
        router.grantRole(router.RELAYER_ROLE(), c.relayer);
        router.grantRole(router.SOLVER_ROLE(), c.relayer);

        escrow.grantRole(escrow.ROUTER_ROLE(), address(router));
        escrow.grantRole(escrow.ARBITER_ROLE(), c.arbiter);
        escrow.setHooks(address(reputation), address(loyalty));
        // 5% of order value back in TRST (1 TRST ≈ $1 notionally)
        escrow.setRewardRate(d.usdc, escrow.rewardRateFor(d.usdc, 500));
        escrow.setRewardRate(d.dai, escrow.rewardRateFor(d.dai, 500));

        reputation.grantRole(reputation.RECORDER_ROLE(), address(escrow));
        loyalty.grantRole(loyalty.MINTER_ROLE(), address(escrow));

        d.escrow = address(escrow);
        d.reputation = address(reputation);
        d.loyalty = address(loyalty);
        d.router = address(router);
        d.authenticity = _deployAuthenticity(c);
    }

    function _deployAuthenticity(Cfg memory c) internal returns (address) {
        TrestleAuthenticity authenticity = new TrestleAuthenticity(c.deployer);
        bytes32 sellerRole = authenticity.SELLER_ROLE();
        authenticity.grantRole(sellerRole, c.deployer);
        for (uint256 i; i < c.sellers.length; ++i) {
            authenticity.grantRole(sellerRole, c.sellers[i]);
        }
        // the platform admin verifies sellers on-chain from the admin UI
        if (c.arbiter != c.deployer) authenticity.grantRole(authenticity.DEFAULT_ADMIN_ROLE(), c.arbiter);
        return address(authenticity);
    }

    function _deployAccountAbstraction(Cfg memory c, Deployed memory d) internal {
        // reuse the canonical v0.7 EntryPoint when present (public testnets), else deploy one
        d.entryPoint =
            CANONICAL_ENTRYPOINT_V07.code.length > 0 ? CANONICAL_ENTRYPOINT_V07 : address(new EntryPoint());
        d.accountFactory = address(new SimpleAccountFactory(IEntryPoint(d.entryPoint)));
        TrestlePaymaster paymaster = new TrestlePaymaster(IEntryPoint(d.entryPoint), c.deployer, c.capWei);
        paymaster.setSponsoredTarget(d.escrow, true);
        paymaster.setSponsoredTarget(d.router, true);
        paymaster.setSponsoredTarget(d.loyalty, true);
        // demo stablecoins: lets smart accounts sweep refunds/payouts back to their owner gaslessly
        paymaster.setSponsoredTarget(d.usdc, true);
        paymaster.setSponsoredTarget(d.dai, true);
        if (c.depositWei > 0) paymaster.deposit{value: c.depositWei}();
        if (c.stakeWei > 0) paymaster.addStake{value: c.stakeWei}(1 days);
        d.paymaster = address(paymaster);
    }

    function _write(Deployed memory d, Cfg memory c) internal {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "deployBlock", block.number);
        vm.serializeAddress(k, "deployer", c.deployer);
        vm.serializeAddress(k, "relayer", c.relayer);
        vm.serializeAddress(k, "attester", c.attester);
        vm.serializeAddress(k, "arbiter", c.arbiter);
        vm.serializeAddress(k, "treasury", c.treasury);
        vm.serializeAddress(k, "usdc", d.usdc);
        vm.serializeAddress(k, "dai", d.dai);
        vm.serializeAddress(k, "escrow", d.escrow);
        vm.serializeAddress(k, "reputation", d.reputation);
        vm.serializeAddress(k, "loyalty", d.loyalty);
        vm.serializeAddress(k, "authenticity", d.authenticity);
        vm.serializeAddress(k, "relayerAdapter", d.adapter);
        vm.serializeAddress(k, "paymentRouter", d.router);
        vm.serializeAddress(k, "entryPoint", d.entryPoint);
        vm.serializeAddress(k, "accountFactory", d.accountFactory);
        string memory json = vm.serializeAddress(k, "paymaster", d.paymaster);
        string memory path = string.concat(
            vm.projectRoot(), "/../shared/src/addresses/deployments/", vm.toString(block.chainid), ".json"
        );
        vm.writeJson(json, path);
        console2.log("Trestle deployed on chain", block.chainid);
        console2.log("  router  ", d.router);
        console2.log("  escrow  ", d.escrow);
        console2.log("  written ", path);
    }
}
