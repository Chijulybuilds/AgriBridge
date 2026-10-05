// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {LendingPool} from "src/LendingPool.sol";
import {ICommodityPriceOracle} from "src/interfaces/ICommodityPriceOracle.sol";
import {DemoUSDC} from "src/demo/DemoUSDC.sol";
import {DeployDemo} from "script/DeployDemo.s.sol";

/**
 * @title DemoDeploymentTest
 * @notice Runs the real demo deploy script, then plays the whole demo story against it:
 *         register, verify, invest, borrow, repay in full, price crash, liquidate, withdraw.
 *         If this passes, every step the demo shows works on a fresh deployment.
 */
contract DemoDeploymentTest is Test {
    DeployDemo.Deployment internal d;

    address internal verifier = makeAddr("demoVerifier");
    address internal farmer = makeAddr("demoFarmer");
    address internal investor = makeAddr("demoInvestor");

    uint96 internal constant QUANTITY = 1000e18; // 1,000 kg

    function setUp() public {
        vm.warp(100 weeks);
        vm.setEnv("DEMO_VERIFIER", vm.toString(verifier));
        vm.setEnv("DEMO_FARMER", vm.toString(farmer));
        vm.setEnv("DEMO_INVESTOR", vm.toString(investor));
        d = new DeployDemo().run();
    }

    function _registerAndVerify(CommodityRegistry.CommodityType commodityType) internal returns (uint256 id) {
        vm.prank(farmer);
        id = d.registry
            .registerCommodity(
                commodityType, QUANTITY, CommodityRegistry.Grade.A, uint64(block.timestamp - 1 days), 180
            );
        vm.prank(verifier);
        d.registry.approveCommodity(id);
    }

    function test_DemoAccountsAreFundedAndPoolIsSeeded() public view {
        assertEq(d.usdc.balanceOf(verifier), 50_000e6);
        assertEq(d.usdc.balanceOf(farmer), 2_000e6);
        assertEq(d.usdc.balanceOf(investor), 50_000e6);
        assertEq(d.pool.totalAssets(), 50_000e6);
    }

    function test_DemoVerifierHasOperationalRolesButNotAdmin() public view {
        assertTrue(d.registry.hasRole(d.registry.VERIFIER_ROLE(), verifier));
        assertTrue(d.oracle.hasRole(d.oracle.PRICE_UPDATER_ROLE(), verifier));
        assertTrue(d.pool.hasRole(d.pool.LIQUIDATOR_ROLE(), verifier));
        assertFalse(d.registry.hasRole(d.registry.DEFAULT_ADMIN_ROLE(), verifier));
        assertFalse(d.pool.hasRole(d.pool.DEFAULT_ADMIN_ROLE(), verifier));
    }

    function test_PricesStayFreshForTheWholeDemo() public {
        vm.warp(block.timestamp + 30 days);
        assertTrue(d.oracle.isFresh(ICommodityPriceOracle.CommodityType.Cocoa));
    }

    function test_FullDemoStory() public {
        // Investor adds liquidity on top of the seed.
        vm.startPrank(investor);
        d.usdc.approve(address(d.pool), 20_000e6);
        d.pool.deposit(20_000e6);
        vm.stopPrank();

        // Farmer: register cocoa, get it verified, borrow, then repay everything a month later.
        uint256 cocoa = _registerAndVerify(CommodityRegistry.CommodityType.Cocoa);
        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.pool), true);
        uint256 loan = d.pool.borrow(cocoa, QUANTITY, 4_000e6);
        vm.stopPrank();
        assertEq(uint8(d.registry.getCommodity(cocoa).status), uint8(CommodityRegistry.CommodityStatus.Collateralized));

        vm.warp(block.timestamp + 30 days);
        vm.startPrank(farmer);
        d.usdc.approve(address(d.pool), type(uint256).max);
        d.pool.repay(loan, type(uint256).max);
        vm.stopPrank();
        assertEq(d.commodityToken.balanceOf(farmer, cocoa), QUANTITY, "collateral returned");
        assertEq(uint8(d.registry.getCommodity(cocoa).status), uint8(CommodityRegistry.CommodityStatus.Released));

        // Second lot: borrow, the price crashes, the verifier liquidates.
        uint256 cashew = _registerAndVerify(CommodityRegistry.CommodityType.Cashew); // $3,200 lot
        vm.prank(farmer);
        uint256 risky = d.pool.borrow(cashew, QUANTITY, 2_000e6);

        vm.prank(verifier);
        d.oracle.setPrice(ICommodityPriceOracle.CommodityType.Cashew, 150 * 10 ** 6); // $1.50/kg
        assertLt(d.pool.getHealthFactor(risky), 1e18);

        vm.startPrank(verifier);
        d.usdc.approve(address(d.pool), type(uint256).max);
        d.pool.liquidate(risky);
        vm.stopPrank();
        assertEq(d.commodityToken.balanceOf(verifier, cashew), QUANTITY);
        assertEq(uint8(d.registry.getCommodity(cashew).status), uint8(CommodityRegistry.CommodityStatus.Liquidated));

        // Investor withdraws, having earned the first loan's interest.
        uint256 shares = d.shareToken.balanceOf(investor);
        vm.prank(investor);
        d.pool.withdraw(shares);
        assertGt(d.usdc.balanceOf(investor), 50_000e6, "investor ends with more than they put in");
    }

    function test_FaucetCapsEachMint() public {
        vm.expectRevert(DemoUSDC.DemoUSDC__OverFaucetLimit.selector);
        d.usdc.faucet(farmer, 100_001e6);

        d.usdc.faucet(farmer, 100_000e6);
        assertEq(d.usdc.balanceOf(farmer), 102_000e6);
        assertEq(d.usdc.decimals(), 6);
    }

    /// @dev The loan status enum the demo relies on.
    function test_LoanStatusAfterRepayIsRepaid() public {
        uint256 rice = _registerAndVerify(CommodityRegistry.CommodityType.Rice); // $1,200 lot
        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.pool), true);
        uint256 loan = d.pool.borrow(rice, QUANTITY, 500e6);
        d.usdc.approve(address(d.pool), type(uint256).max);
        d.pool.repay(loan, type(uint256).max);
        vm.stopPrank();

        (,,, LendingPool.LoanStatus status,) = d.pool.getLoanDetails(loan);
        assertEq(uint8(status), uint8(LendingPool.LoanStatus.REPAID));
    }
}
