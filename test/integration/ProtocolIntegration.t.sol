// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {CommodityToken} from "src/CommodityToken.sol";
import {CommodityPriceOracle} from "src/CommodityPriceOracle.sol";
import {AgriShareToken} from "src/AgriShareToken.sol";
import {LendingPool} from "src/LendingPool.sol";
import {ICommodityPriceOracle} from "src/interfaces/ICommodityPriceOracle.sol";

/// @notice 6-decimal USDC stand-in.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/**
 * @title ProtocolIntegrationTest
 * @notice Wires the five real contracts together exactly as deployment does, and drives the full
 *         journey: register, approve, mint, deposit liquidity, borrow, repay.
 * @dev This suite exists because the unit tests all price collateral through a *mock* oracle that
 *      matches LendingPool's expected interface. That mock hid a production defect: the real
 *      CommodityPriceOracle implemented none of the functions LendingPool calls, so borrowing
 *      reverted against the actually-deployed contracts while every unit test stayed green.
 *      These tests use the real oracle, so that class of drift cannot recur.
 */
contract ProtocolIntegrationTest is Test {
    CommodityRegistry internal registry;
    CommodityToken internal commodityToken;
    CommodityPriceOracle internal oracle;
    AgriShareToken internal shareToken;
    LendingPool internal pool;
    MockUSDC internal usdc;

    address internal admin = makeAddr("admin");
    address internal verifier = makeAddr("verifier");
    address internal farmer = makeAddr("farmer");
    address internal investor = makeAddr("investor");

    uint256 internal constant HEARTBEAT = 1 days;
    uint128 internal constant COCOA_PRICE = 650 * 10 ** 6; // $6.50/kg at 8 decimals
    uint96 internal constant QUANTITY = 1000e18; // 1,000 kg at 18 decimals
    uint256 internal constant INVESTOR_LIQUIDITY = 100_000e6; // $100,000 USDC

    function setUp() public {
        vm.warp(100 weeks);

        usdc = new MockUSDC();
        registry = new CommodityRegistry(admin);
        commodityToken = new CommodityToken(admin, address(registry), "https://api.agribridge.io/metadata/");
        oracle = new CommodityPriceOracle(admin, HEARTBEAT);
        shareToken = new AgriShareToken(address(usdc), "agUSDC", "aU");
        pool = new LendingPool(
            admin, address(usdc), address(registry), address(commodityToken), address(shareToken), address(oracle)
        );

        // This test contract deployed the share token, so it performs the one-time pool wiring.
        shareToken.setLendingPool(address(pool));

        // Post-deploy wiring, mirroring script/WireProtocol.s.sol.
        vm.startPrank(admin);
        registry.setCommodityTokenAddress(address(commodityToken));
        registry.setLendingPoolAddress(address(pool));
        registry.grantRole(registry.VERIFIER_ROLE(), verifier);
        registry.grantRole(registry.POOL_ROLE(), address(pool));
        oracle.setCommodityRegistry(address(registry));
        oracle.setPrice(ICommodityPriceOracle.CommodityType.Cocoa, COCOA_PRICE);
        vm.stopPrank();

        usdc.mint(investor, INVESTOR_LIQUIDITY);
    }

    /// @dev Farmer registers cocoa and the verifier approves it, which mints the ERC-1155 collateral.
    function _registerAndApprove() internal returns (uint256 commodityId) {
        vm.prank(farmer);
        commodityId = registry.registerCommodity(
            CommodityRegistry.CommodityType.Cocoa,
            QUANTITY,
            CommodityRegistry.Grade.A,
            uint64(block.timestamp - 1 days),
            180
        );

        vm.prank(verifier);
        registry.approveCommodity(commodityId);
    }

    function _seedPool() internal {
        vm.startPrank(investor);
        usdc.approve(address(pool), INVESTOR_LIQUIDITY);
        pool.deposit(INVESTOR_LIQUIDITY);
        vm.stopPrank();
    }

    /**
     * @notice Approval mints collateral tokens to the farmer, 1:1 with the registered quantity.
     */
    function test_ApprovalMintsCollateralToFarmer() public {
        uint256 commodityId = _registerAndApprove();

        assertEq(commodityToken.balanceOf(farmer, commodityId), QUANTITY);
        assertTrue(registry.isApprovedForBorrowing(commodityId));
    }

    /**
     * @notice Investor deposit mints agUSDC shares and moves USDC into the pool.
     */
    function test_InvestorDepositMintsShares() public {
        _seedPool();

        assertEq(usdc.balanceOf(address(pool)), INVESTOR_LIQUIDITY);
        assertGt(shareToken.balanceOf(investor), 0);
    }

    /**
     * @notice The regression this whole suite exists for: borrowing against the REAL oracle.
     * @dev Before the oracle fix this reverted, because LendingPool called getCollateralValue and
     *      the deployed oracle had no such function.
     */
    function test_FarmerCanBorrowAgainstRealOracle() public {
        uint256 commodityId = _registerAndApprove();
        _seedPool();

        // 1,000 kg cocoa at $6.50/kg is $6,500 of collateral. At the 70% max LTV the ceiling is
        // $4,550, so $4,000 must be accepted.
        assertEq(oracle.getCollateralValue(commodityId, QUANTITY), 6_500e6);

        uint256 borrowAmount = 4_000e6;

        vm.startPrank(farmer);
        commodityToken.setApprovalForAll(address(pool), true);
        uint256 loanId = pool.borrow(commodityId, QUANTITY, borrowAmount);
        vm.stopPrank();

        assertEq(usdc.balanceOf(farmer), borrowAmount);
        assertEq(commodityToken.balanceOf(address(pool), commodityId), QUANTITY);

        // A fresh loan at 61.5% LTV must be comfortably healthy.
        assertGt(pool.getHealthFactor(loanId), 1e18);
    }

    /**
     * @notice Borrowing beyond the 70% max LTV is rejected using the real oracle's valuation.
     */
    function test_BorrowRevertsAboveMaxLtv() public {
        uint256 commodityId = _registerAndApprove();
        _seedPool();

        // $6,500 collateral caps borrowing at $4,550; $5,000 must be rejected.
        vm.startPrank(farmer);
        commodityToken.setApprovalForAll(address(pool), true);
        vm.expectRevert(LendingPool.LendingPool__ExceedsMaxLTV.selector);
        pool.borrow(commodityId, QUANTITY, 5_000e6);
        vm.stopPrank();
    }

    /**
     * @notice A stale price feed must block new borrowing rather than valuing collateral off dead data.
     */
    function test_BorrowRevertsOnStalePrice() public {
        uint256 commodityId = _registerAndApprove();
        _seedPool();

        vm.warp(block.timestamp + HEARTBEAT + 1);

        vm.startPrank(farmer);
        commodityToken.setApprovalForAll(address(pool), true);
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceStale.selector);
        pool.borrow(commodityId, QUANTITY, 4_000e6);
        vm.stopPrank();
    }

    /**
     * @notice Full round trip: borrow then repay in full, clearing the debt.
     */
    function test_FarmerCanRepayLoan() public {
        uint256 commodityId = _registerAndApprove();
        _seedPool();

        uint256 borrowAmount = 4_000e6;

        vm.startPrank(farmer);
        commodityToken.setApprovalForAll(address(pool), true);
        uint256 loanId = pool.borrow(commodityId, QUANTITY, borrowAmount);
        vm.stopPrank();

        // Let interest accrue, then fund the farmer for the interest portion.
        vm.warp(block.timestamp + 30 days);
        usdc.mint(farmer, 1_000e6);

        // repay() rejects overpayment, so settle exactly the outstanding debt.
        (,,,, uint256 totalDebt) = pool.getLoanDetails(loanId);
        assertGt(totalDebt, borrowAmount, "interest should have accrued over 30 days");

        vm.startPrank(farmer);
        usdc.approve(address(pool), totalDebt);
        pool.repay(loanId, totalDebt);
        vm.stopPrank();

        // Collateral returns to the farmer once the loan is cleared.
        assertEq(commodityToken.balanceOf(farmer, commodityId), QUANTITY);
    }

    /// @dev Opens a $4,000 loan against the farmer's whole cocoa lot.
    function _openLoan() internal returns (uint256 commodityId, uint256 loanId) {
        commodityId = _registerAndApprove();
        _seedPool();

        vm.startPrank(farmer);
        commodityToken.setApprovalForAll(address(pool), true);
        loanId = pool.borrow(commodityId, QUANTITY, 4_000e6);
        vm.stopPrank();
    }

    function _status(uint256 commodityId) internal view returns (CommodityRegistry.CommodityStatus) {
        return registry.getCommodity(commodityId).status;
    }

    /**
     * @notice Borrowing marks the commodity Collateralized on its own; no admin call is needed.
     */
    function test_BorrowMarksCommodityCollateralized() public {
        (uint256 commodityId,) = _openLoan();

        assertEq(uint8(_status(commodityId)), uint8(CommodityRegistry.CommodityStatus.Collateralized));
    }

    /**
     * @notice "Repay in full" must close the loan even though the transaction is mined after the
     *         farmer read the debt. Interest accrues every second, so a wallet can never send the
     *         exact amount; the pool takes the debt as it stands at mining and no more.
     */
    function test_RepayInFullClosesLoanWhenDebtGrewBeforeMining() public {
        (uint256 commodityId, uint256 loanId) = _openLoan();

        vm.warp(block.timestamp + 30 days);
        usdc.mint(farmer, 1_000e6);

        // The app reads the debt, then the transaction lands a block later.
        (,,,, uint256 shownDebt) = pool.getLoanDetails(loanId);
        vm.warp(block.timestamp + 12);
        (,,,, uint256 debtAtMining) = pool.getLoanDetails(loanId);
        assertGt(debtAtMining, shownDebt, "debt grows every second");

        uint256 balanceBefore = usdc.balanceOf(farmer);
        vm.startPrank(farmer);
        usdc.approve(address(pool), type(uint256).max);
        pool.repay(loanId, type(uint256).max);
        vm.stopPrank();

        (, uint256 principal,, LendingPool.LoanStatus status,) = pool.getLoanDetails(loanId);
        assertEq(uint8(status), uint8(LendingPool.LoanStatus.REPAID));
        assertEq(principal, 0);
        assertEq(balanceBefore - usdc.balanceOf(farmer), debtAtMining, "charged exactly the debt, not the cap");
        assertEq(commodityToken.balanceOf(farmer, commodityId), QUANTITY);
        assertEq(uint8(_status(commodityId)), uint8(CommodityRegistry.CommodityStatus.Released));
    }

    /**
     * @notice After a price crash leaves the loan underwater, the liquidator pays the debt and
     *         receives the loan's collateral. It used to revert, because it tried to pay out the
     *         collateral plus a 5% bonus that the pool never held.
     */
    function test_LiquidationAfterPriceCrashTransfersCollateral() public {
        (uint256 commodityId, uint256 loanId) = _openLoan();

        // Cocoa halves: $3,250 of collateral against $4,000 of debt.
        vm.prank(admin);
        oracle.setPrice(ICommodityPriceOracle.CommodityType.Cocoa, COCOA_PRICE / 2);
        assertLt(pool.getHealthFactor(loanId), 1e18);

        (,,,, uint256 debt) = pool.getLoanDetails(loanId);
        usdc.mint(admin, debt);
        uint256 poolCashBefore = usdc.balanceOf(address(pool));

        // The deploying admin holds LIQUIDATOR_ROLE from the pool's constructor.
        vm.startPrank(admin);
        usdc.approve(address(pool), debt);
        pool.liquidate(loanId);
        vm.stopPrank();

        assertEq(commodityToken.balanceOf(admin, commodityId), QUANTITY);
        assertEq(commodityToken.balanceOf(address(pool), commodityId), 0);
        assertEq(usdc.balanceOf(address(pool)) - poolCashBefore, debt, "pool recovers the full debt");
        (,,, LendingPool.LoanStatus status,) = pool.getLoanDetails(loanId);
        assertEq(uint8(status), uint8(LendingPool.LoanStatus.LIQUIDATED));
        assertEq(uint8(_status(commodityId)), uint8(CommodityRegistry.CommodityStatus.Liquidated));
    }

    /**
     * @notice Two loans against one lot: the commodity stays Collateralized until the last closes.
     */
    function test_CommodityReleasedOnlyWhenLastLoanCloses() public {
        uint256 commodityId = _registerAndApprove();
        _seedPool();

        vm.startPrank(farmer);
        commodityToken.setApprovalForAll(address(pool), true);
        uint256 first = pool.borrow(commodityId, QUANTITY / 2, 1_000e6);
        uint256 second = pool.borrow(commodityId, QUANTITY / 2, 1_000e6);
        usdc.approve(address(pool), type(uint256).max);

        pool.repay(first, type(uint256).max);
        assertEq(uint8(_status(commodityId)), uint8(CommodityRegistry.CommodityStatus.Collateralized));

        pool.repay(second, type(uint256).max);
        vm.stopPrank();
        assertEq(uint8(_status(commodityId)), uint8(CommodityRegistry.CommodityStatus.Released));
        assertEq(commodityToken.balanceOf(farmer, commodityId), QUANTITY);
    }

    /**
     * @notice A payment smaller than the interest owed rolls the unpaid interest into the loan.
     *         totalBorrowed has to follow it, or the final repayment underflows and reverts.
     */
    function test_SmallPaymentThenFullRepayment() public {
        (uint256 commodityId, uint256 loanId) = _openLoan();

        vm.warp(block.timestamp + 365 days);
        usdc.mint(farmer, 2_000e6);

        vm.startPrank(farmer);
        usdc.approve(address(pool), type(uint256).max);
        pool.repay(loanId, 1e6); // $1, far less than a year's interest

        // Settle the exact remaining debt (same block, so no further interest).
        (,,,, uint256 remaining) = pool.getLoanDetails(loanId);
        pool.repay(loanId, remaining);
        vm.stopPrank();

        (,,, LendingPool.LoanStatus status,) = pool.getLoanDetails(loanId);
        assertEq(uint8(status), uint8(LendingPool.LoanStatus.REPAID));
        assertEq(pool.totalBorrowed(), 0);
        assertEq(commodityToken.balanceOf(farmer, commodityId), QUANTITY);
    }
}
