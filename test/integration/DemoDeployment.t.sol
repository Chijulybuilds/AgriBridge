// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {LendingPool} from "src/LendingPool.sol";
import {DemoUSDC} from "src/demo/DemoUSDC.sol";
import {Marketplace} from "src/Marketplace.sol";
import {DeployDemo} from "script/DeployDemo.s.sol";
import {CommodityDefaults} from "script/CommodityDefaults.sol";
import {ProtocolDeployer} from "script/ProtocolDeployer.sol";

/**
 * @title DemoDeploymentTest
 * @notice Runs the real demo deploy script, then plays the whole demo story against it: intake,
 *         verification by the Safe, invest, borrow, repay in full, price crash, liquidate, withdraw.
 *         If this passes, every step the demo shows works on a fresh deployment.
 */
contract DemoDeploymentTest is Test {
    address internal constant SAFE = 0xDa152AfD8C2efDA383fde6F840f590C93738de12;

    ProtocolDeployer.Deployment internal d;
    DemoUSDC internal usdc;
    address internal deployer;

    address internal farmer = makeAddr("demoFarmer");
    address internal investor = makeAddr("demoInvestor");

    uint96 internal constant QUANTITY = 1000e18; // 1,000 kg
    bytes32 internal constant EVIDENCE = keccak256("signed inspection report");

    function setUp() public {
        vm.warp(100 weeks);
        vm.setEnv("DEMO_FARMER", vm.toString(farmer));
        vm.setEnv("DEMO_INVESTOR", vm.toString(investor));
        d = new DeployDemo().run();
        usdc = DemoUSDC(d.usdc);
        (, deployer,) = vm.readCallers();
    }

    /// @dev The farmer delivers a lot to demo warehouse 1 and the Safe verifies it as Grade A.
    function _deliverAndVerify(uint256 commodityId) internal returns (uint256 lotId) {
        vm.prank(farmer);
        lotId = d.registry.requestIntake(commodityId, QUANTITY, 1, uint64(block.timestamp - 1 days));
        vm.prank(SAFE);
        d.registry.approveIntake(lotId, QUANTITY, CommodityRegistry.Grade.A, EVIDENCE);
    }

    function test_DemoAccountsAreFundedAndPoolIsSeeded() public view {
        assertEq(usdc.balanceOf(SAFE), 50_000e6);
        assertEq(usdc.balanceOf(farmer), 2_000e6);
        assertEq(usdc.balanceOf(investor), 50_000e6);
        assertEq(d.pool.totalAssets(), 50_000e6, "investors' liquidity");
        assertEq(d.pool.reserves(), 10_000e6, "the keeper's backstop");
        assertTrue(d.pool.hasRole(d.pool.KEEPER_ROLE(), address(d.keeper)));
    }

    function test_SixCommoditiesAndTwoWarehousesAreSeeded() public view {
        assertEq(d.config.commodityCount(), CommodityDefaults.COUNT);
        assertEq(d.config.getCommodity(CommodityDefaults.SOYBEANS).name, "Soybeans");
        assertEq(d.registry.warehouseCount(), 2);
        assertTrue(d.oracle.isFresh(CommodityDefaults.SOYBEANS));
    }

    function test_SafeIsTheOnlyVerifierAndTheAdmin() public view {
        bytes32 admin = 0x00;
        assertEq(d.registry.verifier(), SAFE);
        assertTrue(d.registry.hasRole(d.registry.VERIFIER_ROLE(), SAFE));

        assertTrue(d.config.hasRole(admin, SAFE));
        assertTrue(d.registry.hasRole(admin, SAFE));
        assertTrue(d.commodityToken.hasRole(admin, SAFE));
        assertTrue(d.oracle.hasRole(admin, SAFE));
        assertTrue(d.pool.hasRole(admin, SAFE));
        assertTrue(d.marketplace.hasRole(admin, SAFE));
        assertTrue(d.marketplace.hasRole(d.marketplace.CLEARANCE_ROLE(), SAFE));
        assertTrue(d.desk.hasRole(admin, SAFE));
        assertTrue(d.desk.hasRole(d.desk.CUSTODIAN_ROLE(), SAFE), "the Safe confirms releases");
        assertEq(d.marketplace.feeRecipient(), SAFE);
        assertEq(d.desk.feeRecipient(), SAFE);
    }

    function test_DeployerKeepsNoRoles() public view {
        bytes32 admin = 0x00;
        assertFalse(d.config.hasRole(admin, deployer));
        assertFalse(d.registry.hasRole(admin, deployer));
        assertFalse(d.commodityToken.hasRole(admin, deployer));
        assertFalse(d.oracle.hasRole(admin, deployer));
        assertFalse(d.oracle.hasRole(d.oracle.PRICE_UPDATER_ROLE(), deployer));
        assertFalse(d.pool.hasRole(admin, deployer));
        assertFalse(d.marketplace.hasRole(admin, deployer));
        assertFalse(d.marketplace.hasRole(d.marketplace.CLEARANCE_ROLE(), deployer));
        assertFalse(d.desk.hasRole(admin, deployer));
        assertFalse(d.desk.hasRole(d.desk.CUSTODIAN_ROLE(), deployer));
    }

    function test_PricesStayFreshForTheWholeDemo() public {
        vm.warp(block.timestamp + 30 days);
        assertTrue(d.oracle.isFresh(CommodityDefaults.COCOA));
    }

    function test_FullDemoStory() public {
        // Investor adds liquidity on top of the seed.
        vm.startPrank(investor);
        usdc.approve(address(d.pool), 20_000e6);
        d.pool.deposit(20_000e6);
        vm.stopPrank();

        // Farmer: deliver cocoa, the Safe verifies it, borrow, then repay everything a month later.
        uint256 cocoa = _deliverAndVerify(CommodityDefaults.COCOA);
        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.pool), true);
        uint256 loan = d.pool.borrow(cocoa, QUANTITY, 2_000e6, uint64(block.timestamp + 90 days));
        vm.stopPrank();

        vm.warp(block.timestamp + 30 days);
        vm.startPrank(farmer);
        usdc.approve(address(d.pool), type(uint256).max);
        d.pool.repay(loan, type(uint256).max);
        vm.stopPrank();
        assertEq(d.commodityToken.balanceOf(farmer, cocoa), QUANTITY, "collateral returned");

        // Second lot: borrow, the price crashes, the Safe liquidates and the farmer gets the rest back.
        uint256 cashew = _deliverAndVerify(CommodityDefaults.CASHEW); // $3,200 lot, priced locally
        vm.prank(farmer);
        uint256 risky = d.pool.borrow(cashew, QUANTITY, 1_400e6, uint64(block.timestamp + 30 days));

        // The demo's price crash: the Safe sets the price directly, past the oracle's move cap.
        vm.prank(SAFE);
        d.oracle.forcePrice(CommodityDefaults.CASHEW, 170 * 10 ** 6); // $1.70/kg: $1,700 against $1,400
        assertLt(d.pool.getHealthFactor(risky), 1e18);

        vm.startPrank(SAFE);
        usdc.approve(address(d.pool), type(uint256).max);
        d.pool.liquidate(risky);
        vm.stopPrank();
        uint256 seized = d.commodityToken.balanceOf(SAFE, cashew);
        assertGt(seized, 0);
        assertEq(d.commodityToken.balanceOf(farmer, cashew), QUANTITY - seized, "leftover returned");

        // Investor withdraws, having earned the first loan's interest.
        uint256 shares = d.shareToken.balanceOf(investor);
        vm.roll(block.number + 1);
        vm.prank(investor);
        d.pool.withdraw(shares);
        assertGt(usdc.balanceOf(investor), 50_000e6, "investor ends with more than they put in");
    }

    /// @notice A farmer sells part of a lot on the marketplace; the buyer withdraws it from the warehouse.
    function test_MarketplaceAndWithdrawal() public {
        uint256 maize = _deliverAndVerify(CommodityDefaults.MAIZE);
        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.marketplace), true);
        uint256 listingId = d.marketplace.list(maize, 600e18, Marketplace.PriceMode.Reference, 10_000);
        vm.stopPrank();

        address buyer = makeAddr("feedMill");
        usdc.faucet(buyer, 1_000e6);
        vm.startPrank(buyer);
        usdc.approve(address(d.marketplace), type(uint256).max);
        d.marketplace.buy(listingId, 600e18, type(uint256).max);

        d.commodityToken.setApprovalForAll(address(d.desk), true);
        uint256 requestId = d.desk.requestWithdrawal(maize, 600e18, 0);
        vm.stopPrank();

        vm.prank(SAFE);
        d.desk.confirmRelease(requestId, 0);
        assertEq(d.commodityToken.totalSupply(maize), 400e18);
        assertEq(d.registry.getWarehouse(1).storedKg, 400e18);
    }

    function test_FaucetCapsEachMint() public {
        vm.expectRevert(DemoUSDC.DemoUSDC__OverFaucetLimit.selector);
        usdc.faucet(farmer, 100_001e6);

        usdc.faucet(farmer, 100_000e6);
        assertEq(usdc.balanceOf(farmer), 102_000e6);
        assertEq(usdc.decimals(), 6);
    }

    function test_LoanStatusAfterRepayIsRepaid() public {
        uint256 rice = _deliverAndVerify(CommodityDefaults.RICE); // $324 after rice's 10% basis cut
        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.pool), true);
        uint256 loan = d.pool.borrow(rice, QUANTITY, 100e6, uint64(block.timestamp + 30 days));
        usdc.approve(address(d.pool), type(uint256).max);
        d.pool.repay(loan, type(uint256).max);
        vm.stopPrank();

        (,,, LendingPool.LoanStatus status,) = d.pool.getLoanDetails(loan);
        assertEq(uint8(status), uint8(LendingPool.LoanStatus.REPAID));
    }
}
