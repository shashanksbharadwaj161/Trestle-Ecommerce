// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TrestleEscrow} from "../../src/TrestleEscrow.sol";
import {TrestleReputation} from "../../src/TrestleReputation.sol";
import {TrestleLoyalty} from "../../src/TrestleLoyalty.sol";
import {TrestleAuthenticity} from "../../src/TrestleAuthenticity.sol";
import {TrestlePaymentRouter} from "../../src/TrestlePaymentRouter.sol";
import {AttestationRelayerAdapter} from "../../src/adapters/AttestationRelayerAdapter.sol";
import {TestToken} from "../../src/mocks/TestToken.sol";

/// @notice Deploys one full Trestle "chain" stack on the current test EVM.
abstract contract TrestleBase is Test {
    struct Stack {
        TrestleEscrow escrow;
        TrestleReputation reputation;
        TrestleLoyalty loyalty;
        TrestlePaymentRouter router;
        AttestationRelayerAdapter adapter;
        TestToken usdc;
    }

    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal arbiter = makeAddr("arbiter");
    address internal relayer = makeAddr("relayer");
    address internal buyer = makeAddr("buyer");
    address internal seller = makeAddr("seller");
    address internal stranger = makeAddr("stranger");
    uint256 internal attesterKey = 0xA77E57;
    address internal attester;

    function _deployStack() internal returns (Stack memory s) {
        attester = vm.addr(attesterKey);
        vm.startPrank(admin);
        s.usdc = new TestToken("Test USD Coin", "tUSDC", 6, 1_000e6, admin);
        s.escrow = new TrestleEscrow(admin);
        s.reputation = new TrestleReputation(admin, 90 days);
        s.loyalty = new TrestleLoyalty(admin, 1_000);
        address[] memory attesters = new address[](1);
        attesters[0] = attester;
        s.adapter = new AttestationRelayerAdapter(admin, attesters, 1);
        s.router = new TrestlePaymentRouter(admin, treasury, 100);
        s.router.setConfig(address(s.escrow), address(s.loyalty), address(s.adapter), treasury, 100);
        s.router.grantRole(s.router.RELAYER_ROLE(), relayer);
        s.router.grantRole(s.router.SOLVER_ROLE(), relayer);

        s.escrow.grantRole(s.escrow.ARBITER_ROLE(), arbiter);
        s.escrow.grantRole(s.escrow.ROUTER_ROLE(), address(s.router));
        s.escrow.setHooks(address(s.reputation), address(s.loyalty));
        s.escrow.setRewardRate(address(s.usdc), s.escrow.rewardRateFor(address(s.usdc), 500)); // 5%
        s.escrow.setRewardRate(address(0), s.escrow.rewardRateFor(address(0), 500));
        s.reputation.grantRole(s.reputation.RECORDER_ROLE(), address(s.escrow));
        s.loyalty.grantRole(s.loyalty.MINTER_ROLE(), address(s.escrow));
        vm.stopPrank();
    }

    function _fund(TestToken token, address to, uint256 amount) internal {
        vm.prank(admin);
        token.mint(to, amount);
    }
}
