// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {ProtocolDeployer} from "script/ProtocolDeployer.sol";
import {FixtureUSDC} from "test/utils/ProtocolFixture.sol";

/// @notice Runs the deployment steps the way a production deploy does (deployer != Safe, feeder included)
///         and checks the final role audit both passes when right and fails when a step is skipped.
contract HandOverTest is Test, ProtocolDeployer {
    address internal constant SAFE = 0xDa152AfD8C2efDA383fde6F840f590C93738de12;

    address internal router = makeAddr("functionsRouter");
    Deployment internal d;

    function setUp() public {
        vm.etch(router, hex"00");
        // The helpers fill in a memory struct, as in the scripts; copy it to storage once complete.
        Deployment memory deployment = _deployProtocol(address(this), address(new FixtureUSDC()), 1 days);
        _seedCommodities(deployment);
        _deployFeeder(deployment, router, address(this), "return Functions.encodeUint256(1);");
        d = deployment;
    }

    /// @dev External so a test can expect the audit to revert.
    function checkHandOver(address _verifier, address _finalAdmin) external view {
        _checkHandOver(d, address(this), _verifier, _finalAdmin);
    }

    function test_FullHandOver_PassesTheAudit() public {
        _handOver(d, address(this), SAFE, SAFE);
        this.checkHandOver(SAFE, SAFE);

        assertTrue(d.feeder.hasRole(0x00, SAFE), "the Safe administers the feeder");
        assertTrue(d.oracle.hasRole(d.oracle.PRICE_UPDATER_ROLE(), address(d.feeder)), "the feeder pushes prices");
        assertEq(d.feeder.commodityIds().length, 4, "the four world-priced commodities");
        assertEq(d.marketplace.feeRecipient(), SAFE);
        assertEq(d.desk.feeRecipient(), SAFE);
    }

    function test_Audit_CatchesASkippedHandOver() public {
        vm.expectRevert(bytes("handover: verifier"));
        this.checkHandOver(SAFE, SAFE);
    }

    function test_Audit_CatchesADeployerThatKeptARole() public {
        _handOver(d, address(this), SAFE, SAFE);
        // Simulate a script that forgot to renounce: the old Safe gives the deployer admin back.
        vm.prank(SAFE);
        d.pool.grantRole(0x00, address(this));

        vm.expectRevert(bytes("handover: the deployer kept a role"));
        this.checkHandOver(SAFE, SAFE);
    }
}
