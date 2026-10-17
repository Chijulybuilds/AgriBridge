// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {LendingPool} from "src/LendingPool.sol";
import {Marketplace} from "src/Marketplace.sol";
import {DemoUSDC} from "src/demo/DemoUSDC.sol";
import {DeployDemo} from "script/DeployDemo.s.sol";
import {CommodityDefaults} from "script/CommodityDefaults.sol";
import {ProtocolDeployer} from "script/ProtocolDeployer.sol";

/**
 * @title SepoliaRehearsal
 * @notice Dress rehearsal on a fork of Sepolia: deploys the demo there and plays the whole story as the
 *         real verifier Safe (a contract on Sepolia), without sending anything to the network.
 * @dev Opt-in, since it needs an RPC endpoint:
 *          SEPOLIA_RPC_URL=https://... forge test --match-path test/fork/SepoliaRehearsal.t.sol
 *      Skipped when SEPOLIA_RPC_URL is not set, so CI does not depend on a network.
 */
contract SepoliaRehearsal is Test {
    address internal constant SAFE = 0xDa152AfD8C2efDA383fde6F840f590C93738de12;
    bytes32 internal constant EVIDENCE = keccak256("signed inspection report");

    ProtocolDeployer.Deployment internal d;
    DemoUSDC internal usdc;

    address internal farmer = makeAddr("rehearsalFarmer");
    address internal investor = makeAddr("rehearsalInvestor");
    address internal feedMill = makeAddr("rehearsalFeedMill");

    function setUp() public {
        if (!vm.envExists("SEPOLIA_RPC_URL")) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(vm.envString("SEPOLIA_RPC_URL"));
        vm.setEnv("DEMO_FARMER", vm.toString(farmer));
        vm.setEnv("DEMO_INVESTOR", vm.toString(investor));
        d = new DeployDemo().run();
        usdc = DemoUSDC(d.usdc);
    }

    function test_TheVerifierIsTheRealSafe() public view {
        assertGt(SAFE.code.length, 0, "the Safe is a contract on Sepolia");
        assertEq(d.registry.verifier(), SAFE);
        assertTrue(d.desk.hasRole(d.desk.CUSTODIAN_ROLE(), SAFE));
    }

    function test_FullStoryOnSepolia() public {
        // Investor funds the pool.
        vm.startPrank(investor);
        usdc.approve(address(d.pool), type(uint256).max);
        d.pool.deposit(20_000e6);
        vm.stopPrank();

        // Farmer delivers cocoa and maize; the Safe verifies both.
        vm.startPrank(farmer);
        uint256 cocoa = d.registry.requestIntake(CommodityDefaults.COCOA, 1_000e18, 1, uint64(block.timestamp));
        uint256 maize = d.registry.requestIntake(CommodityDefaults.MAIZE, 2_000e18, 1, uint64(block.timestamp));
        vm.stopPrank();
        vm.startPrank(SAFE);
        d.registry.approveIntake(cocoa, 1_000e18, CommodityRegistry.Grade.A, EVIDENCE);
        d.registry.approveIntake(maize, 2_000e18, CommodityRegistry.Grade.B, EVIDENCE);
        vm.stopPrank();

        // Farmer borrows against the cocoa; the price crashes; the keeper liquidates with reserves.
        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.pool), true);
        uint256 loanId = d.pool.borrow(cocoa, 1_000e18, 2_000e6, uint64(block.timestamp + 60 days));
        vm.stopPrank();

        // A move over 10% is held, and applies only when the Safe confirms it 10 minutes later.
        vm.prank(SAFE);
        d.oracle.setPrice(CommodityDefaults.COCOA, 280e6);
        (uint256 heldPrice,) = d.oracle.heldPrice(CommodityDefaults.COCOA);
        assertEq(heldPrice, 280e6, "the crash is held");
        assertFalse(d.pool.isLiquidatable(loanId), "and no loan is settled on it yet");

        vm.warp(block.timestamp + d.oracle.CONFIRMATION_DELAY());
        vm.prank(SAFE);
        d.oracle.setPrice(CommodityDefaults.COCOA, 280e6);
        (bool due, bytes memory performData) = d.keeper.checkUpkeep("");
        assertTrue(due);
        d.keeper.performUpkeep(performData);
        assertGt(d.pool.inventory(cocoa), 0);
        assertEq(uint8(d.pool.getLoan(loanId).status), uint8(LendingPool.LoanStatus.ACTIVE), "half settled");
        assertLt(d.pool.getLoan(loanId).collateralKg, 1_000e18, "the rest still backs the advance");

        // Farmer sells maize to a feed mill, which withdraws it; the Safe confirms the release.
        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.marketplace), true);
        uint256 listingId = d.marketplace.list(maize, 2_000e18, Marketplace.PriceMode.Reference, 9_800, 0, 0);
        vm.stopPrank();

        usdc.faucet(feedMill, 5_000e6);
        vm.startPrank(feedMill);
        usdc.approve(address(d.marketplace), type(uint256).max);
        d.marketplace.buy(listingId, 2_000e18, type(uint256).max);
        d.commodityToken.setApprovalForAll(address(d.desk), true);
        usdc.approve(address(d.desk), type(uint256).max); // the storage fee for the time stored
        uint256 requestId = d.desk.requestWithdrawal(maize, 2_000e18, 0);
        vm.stopPrank();

        vm.prank(SAFE);
        d.desk.confirmRelease(requestId, 0);
        assertEq(d.commodityToken.totalSupply(maize), 0, "every maize token burned on release");
    }
}
