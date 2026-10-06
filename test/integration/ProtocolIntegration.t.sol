// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {CommodityPriceOracle} from "src/CommodityPriceOracle.sol";
import {LendingPool} from "src/LendingPool.sol";
import {ProtocolFixture} from "test/utils/ProtocolFixture.sol";

/**
 * @title ProtocolIntegrationTest
 * @notice Wires the real contracts together exactly as deployment does, and drives the full journey:
 *         intake request, verification by the Safe, mint, deposit liquidity, borrow, repay.
 * @dev The unit tests price collateral through mocks. A mock shaped like the interface a contract
 *      expects once hid a production defect (the deployed oracle lacked the function the pool called),
 *      so these tests use the real contracts and that class of drift cannot recur.
 */
contract ProtocolIntegrationTest is ProtocolFixture {
    address internal regulator = makeAddr("regulator");

    uint96 internal constant QUANTITY = 1000e18; // 1,000 kg at 18 decimals
    uint256 internal constant INVESTOR_LIQUIDITY = 100_000e6; // $100,000 USDC
    uint128 internal constant COCOA_PRICE = 650 * 10 ** 6; // $6.50/kg at 8 decimals

    function setUp() public {
        _deployFixture();
        d.registry.grantRole(d.registry.REGULATOR_ROLE(), regulator);
    }

    /// @dev The farmer delivers 1,000 kg of Grade A cocoa and the Safe verifies it.
    function _cocoaLot() internal returns (uint256 lotId) {
        lotId = _verifiedLot(farmer, COCOA, QUANTITY, CommodityRegistry.Grade.A);
    }

    /// @dev Opens a $4,000 loan against the farmer's whole cocoa lot.
    function _openLoan() internal returns (uint256 lotId, uint256 loanId) {
        lotId = _cocoaLot();
        _seedPool(INVESTOR_LIQUIDITY);

        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.pool), true);
        loanId = d.pool.borrow(lotId, QUANTITY, 4_000e6);
        vm.stopPrank();
    }

    function test_VerificationMintsCollateralToFarmer() public {
        uint256 lotId = _cocoaLot();

        assertEq(d.commodityToken.balanceOf(farmer, lotId), QUANTITY);
        assertTrue(d.registry.isUsable(lotId));
    }

    function test_InvestorDepositMintsShares() public {
        _seedPool(INVESTOR_LIQUIDITY);

        assertEq(usdc.balanceOf(address(d.pool)), INVESTOR_LIQUIDITY);
        assertGt(d.shareToken.balanceOf(investor), 0);
    }

    /// @notice Borrowing against the real oracle, priced by the lot's commodity.
    function test_FarmerCanBorrowAgainstRealOracle() public {
        uint256 lotId = _cocoaLot();
        _seedPool(INVESTOR_LIQUIDITY);

        // 1,000 kg cocoa at $6.50/kg is $6,500 of collateral; at 70% the ceiling is $4,550.
        assertEq(d.pool.getCollateralValue(lotId, QUANTITY), 6_500e6);

        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.pool), true);
        uint256 loanId = d.pool.borrow(lotId, QUANTITY, 4_000e6);
        vm.stopPrank();

        assertEq(usdc.balanceOf(farmer), 4_000e6);
        assertEq(d.commodityToken.balanceOf(address(d.pool), lotId), QUANTITY);
        assertGt(d.pool.getHealthFactor(loanId), 1e18);
    }

    /// @notice Each commodity is valued at its own price: 1,000 kg of soybeans at $0.40 is $400.
    function test_CollateralValueUsesTheLotsCommodity() public {
        uint256 soy = _verifiedLot(farmer, SOYBEANS, QUANTITY, CommodityRegistry.Grade.A);
        assertEq(d.pool.getCollateralValue(soy, QUANTITY), 400e6);
    }

    function test_BorrowRevertsAboveMaxLtv() public {
        uint256 lotId = _cocoaLot();
        _seedPool(INVESTOR_LIQUIDITY);

        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.pool), true);
        vm.expectRevert(LendingPool.LendingPool__ExceedsMaxLTV.selector);
        d.pool.borrow(lotId, QUANTITY, 5_000e6);
        vm.stopPrank();
    }

    function test_BorrowRevertsOnStalePrice() public {
        uint256 lotId = _cocoaLot();
        _seedPool(INVESTOR_LIQUIDITY);

        vm.warp(block.timestamp + HEARTBEAT + 1);

        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.pool), true);
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceStale.selector);
        d.pool.borrow(lotId, QUANTITY, 4_000e6);
        vm.stopPrank();
    }

    /// @notice A lot the regulator froze cannot back a new loan.
    function test_BorrowRevertsOnFrozenLot() public {
        uint256 lotId = _cocoaLot();
        _seedPool(INVESTOR_LIQUIDITY);
        vm.prank(regulator);
        d.registry.setLotFrozen(lotId, true);

        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.pool), true);
        vm.expectRevert(LendingPool.LendingPool__CommodityNotApprovedForBorrowing.selector);
        d.pool.borrow(lotId, QUANTITY, 4_000e6);
        vm.stopPrank();
    }

    /// @notice An expired lot cannot back a new loan either.
    function test_BorrowRevertsOnExpiredLot() public {
        uint256 lotId = _cocoaLot();
        vm.warp(d.registry.expiresAt(lotId));
        _seedPool(INVESTOR_LIQUIDITY);

        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.pool), true);
        vm.expectRevert(LendingPool.LendingPool__CommodityNotApprovedForBorrowing.selector);
        d.pool.borrow(lotId, QUANTITY, 1_000e6);
        vm.stopPrank();
    }

    function test_FarmerCanRepayLoan() public {
        (uint256 lotId, uint256 loanId) = _openLoan();

        vm.warp(block.timestamp + 30 days);
        usdc.mint(farmer, 1_000e6);

        (,,,, uint256 totalDebt) = d.pool.getLoanDetails(loanId);
        assertGt(totalDebt, 4_000e6, "interest should have accrued over 30 days");

        vm.startPrank(farmer);
        usdc.approve(address(d.pool), totalDebt);
        d.pool.repay(loanId, totalDebt);
        vm.stopPrank();

        assertEq(d.commodityToken.balanceOf(farmer, lotId), QUANTITY);
    }

    /// @notice Freezing a lot that is already locked in a loan does not trap the farmer's collateral.
    function test_RepayReturnsCollateralOfAFrozenLot() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        vm.prank(regulator);
        d.registry.setLotFrozen(lotId, true);

        usdc.mint(farmer, 100e6);
        vm.startPrank(farmer);
        usdc.approve(address(d.pool), type(uint256).max);
        d.pool.repay(loanId, type(uint256).max);
        vm.stopPrank();

        assertEq(d.commodityToken.balanceOf(farmer, lotId), QUANTITY);
    }

    /**
     * @notice "Repay in full" closes the loan even though the transaction is mined after the farmer
     *         read the debt: interest accrues every second, so the pool takes the debt at mining.
     */
    function test_RepayInFullClosesLoanWhenDebtGrewBeforeMining() public {
        (uint256 lotId, uint256 loanId) = _openLoan();

        vm.warp(block.timestamp + 30 days);
        usdc.mint(farmer, 1_000e6);

        (,,,, uint256 shownDebt) = d.pool.getLoanDetails(loanId);
        vm.warp(block.timestamp + 12);
        (,,,, uint256 debtAtMining) = d.pool.getLoanDetails(loanId);
        assertGt(debtAtMining, shownDebt, "debt grows every second");

        uint256 balanceBefore = usdc.balanceOf(farmer);
        vm.startPrank(farmer);
        usdc.approve(address(d.pool), type(uint256).max);
        d.pool.repay(loanId, type(uint256).max);
        vm.stopPrank();

        (, uint256 principal,, LendingPool.LoanStatus status,) = d.pool.getLoanDetails(loanId);
        assertEq(uint8(status), uint8(LendingPool.LoanStatus.REPAID));
        assertEq(principal, 0);
        assertEq(balanceBefore - usdc.balanceOf(farmer), debtAtMining, "charged exactly the debt, not the cap");
        assertEq(d.commodityToken.balanceOf(farmer, lotId), QUANTITY);
    }

    /// @notice After a price crash leaves the loan underwater, the liquidator pays the debt and
    ///         receives the loan's collateral.
    function test_LiquidationAfterPriceCrashTransfersCollateral() public {
        (uint256 lotId, uint256 loanId) = _openLoan();

        // Cocoa halves: $3,250 of collateral against $4,000 of debt.
        d.oracle.setPrice(COCOA, COCOA_PRICE / 2);
        assertLt(d.pool.getHealthFactor(loanId), 1e18);

        address liquidator = makeAddr("liquidator");
        d.pool.grantRole(d.pool.LIQUIDATOR_ROLE(), liquidator);

        (,,,, uint256 debt) = d.pool.getLoanDetails(loanId);
        usdc.mint(liquidator, debt);
        uint256 poolCashBefore = usdc.balanceOf(address(d.pool));

        vm.startPrank(liquidator);
        usdc.approve(address(d.pool), debt);
        d.pool.liquidate(loanId);
        vm.stopPrank();

        assertEq(d.commodityToken.balanceOf(liquidator, lotId), QUANTITY);
        assertEq(d.commodityToken.balanceOf(address(d.pool), lotId), 0);
        assertEq(usdc.balanceOf(address(d.pool)) - poolCashBefore, debt, "pool recovers the full debt");
        (,,, LendingPool.LoanStatus status,) = d.pool.getLoanDetails(loanId);
        assertEq(uint8(status), uint8(LendingPool.LoanStatus.LIQUIDATED));
    }

    /// @notice Two loans against halves of one lot can each be repaid on their own.
    function test_TwoLoansAgainstOneLot() public {
        uint256 lotId = _cocoaLot();
        _seedPool(INVESTOR_LIQUIDITY);

        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.pool), true);
        uint256 first = d.pool.borrow(lotId, QUANTITY / 2, 1_000e6);
        uint256 second = d.pool.borrow(lotId, QUANTITY / 2, 1_000e6);
        usdc.approve(address(d.pool), type(uint256).max);

        d.pool.repay(first, type(uint256).max);
        assertEq(d.commodityToken.balanceOf(farmer, lotId), QUANTITY / 2);

        d.pool.repay(second, type(uint256).max);
        vm.stopPrank();
        assertEq(d.commodityToken.balanceOf(farmer, lotId), QUANTITY);
    }

    /**
     * @notice A payment smaller than the interest owed rolls the unpaid interest into the loan.
     *         totalBorrowed has to follow it, or the final repayment underflows and reverts.
     */
    function test_SmallPaymentThenFullRepayment() public {
        (uint256 lotId, uint256 loanId) = _openLoan();

        // Keep the price fresh across the year; the loan itself does not need it to repay.
        vm.warp(block.timestamp + 365 days);
        usdc.mint(farmer, 2_000e6);

        vm.startPrank(farmer);
        usdc.approve(address(d.pool), type(uint256).max);
        d.pool.repay(loanId, 1e6); // $1, far less than a year's interest

        (,,,, uint256 remaining) = d.pool.getLoanDetails(loanId);
        d.pool.repay(loanId, remaining);
        vm.stopPrank();

        (,,, LendingPool.LoanStatus status,) = d.pool.getLoanDetails(loanId);
        assertEq(uint8(status), uint8(LendingPool.LoanStatus.REPAID));
        assertEq(d.pool.totalBorrowed(), 0);
        assertEq(d.commodityToken.balanceOf(farmer, lotId), QUANTITY);
    }
}
