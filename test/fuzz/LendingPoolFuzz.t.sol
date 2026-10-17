// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {LendingPool} from "src/LendingPool.sol";
import {ProtocolFixture} from "test/utils/ProtocolFixture.sol";

/**
 * @title LendingPoolFuzzTest
 * @notice Properties that must hold across the input range: deposit round trips are lossless,
 *         valuation is linear, the loan limit holds from both sides, debt never shrinks on its own,
 *         a liquidator never takes more than debt plus the bonus, and deposits never move the
 *         share price.
 */
contract LendingPoolFuzzTest is ProtocolFixture {
    /// @dev $6.50/kg world price less cocoa's 15% basis cut, in 6 decimals.
    uint256 internal constant COCOA_USD_PER_KG_6DP = 5_525_000;

    function setUp() public {
        _deployFixture();
    }

    function testFuzz_DepositWithdrawRoundTripIsLossless(uint256 amount) public {
        amount = bound(amount, 1, 10_000_000e6);
        _seedPool(amount);

        vm.roll(block.number + 1);
        uint256 shares = d.shareToken.balanceOf(investor);
        vm.prank(investor);
        d.pool.withdraw(shares);

        assertEq(usdc.balanceOf(investor), amount, "round trip must return the full deposit");
        assertEq(d.shareToken.balanceOf(investor), 0, "all shares must be burned");
    }

    function testFuzz_CollateralValueScalesWithQuantity(uint96 quantityKg) public {
        uint256 kg = bound(uint256(quantityKg), 1, 1_000_000);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint96 quantity = uint96(kg * 1e18);

        uint256 lotId = _verifiedLot(farmer, COCOA, quantity, CommodityRegistry.Grade.A);

        assertEq(d.pool.getCollateralValue(lotId, quantity), kg * COCOA_USD_PER_KG_6DP);
    }

    /// @notice Every amount up to the limit at maturity is accepted, and opens healthy.
    function testFuzz_BorrowUpToTheLimitSucceeds(uint256 quantityKg, uint256 termDays, uint256 amount) public {
        uint256 kg = bound(quantityKg, 100, 100_000);
        termDays = bound(termDays, 1, 300);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint96 quantity = uint96(kg * 1e18);

        uint256 lotId = _verifiedLot(farmer, COCOA, quantity, CommodityRegistry.Grade.A);
        uint256 limit = d.pool.maxBorrow(lotId, quantity, uint64(block.timestamp + termDays * 1 days));
        vm.assume(limit >= 100e6);
        amount = bound(amount, 100e6, limit);
        _seedPool(amount + 1_000e6);

        uint256 loanId = _borrow(farmer, lotId, quantity, amount, termDays);

        assertEq(usdc.balanceOf(farmer), amount);
        assertGt(d.pool.getHealthFactor(loanId), 1e18, "a new loan is never liquidatable");
    }

    /// @notice Anything above the limit at maturity is always refused.
    function testFuzz_BorrowAboveTheLimitReverts(uint256 quantityKg, uint256 termDays, uint256 excess) public {
        uint256 kg = bound(quantityKg, 100, 100_000);
        termDays = bound(termDays, 1, 300);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint96 quantity = uint96(kg * 1e18);
        uint64 maturity = uint64(block.timestamp + termDays * 1 days);

        uint256 lotId = _verifiedLot(farmer, COCOA, quantity, CommodityRegistry.Grade.A);
        uint256 limit = d.pool.maxBorrow(lotId, quantity, maturity);
        uint256 amount = limit + bound(excess, 1, 1_000_000e6);
        vm.assume(limit >= 100e6 && amount <= 10_000_000e6);
        _seedPool(amount + 1_000e6);

        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.pool), true);
        vm.expectRevert(LendingPool.LendingPool__ExceedsMaxLTV.selector);
        d.pool.borrow(lotId, quantity, amount, maturity);
        vm.stopPrank();
    }

    function testFuzz_DebtIsMonotonicOverTime(uint256 elapsed) public {
        elapsed = bound(elapsed, 1, 365 days);
        uint256 lotId = _verifiedLot(farmer, COCOA, 1_000e18, CommodityRegistry.Grade.A);
        _seedPool(100_000e6);
        uint256 loanId = _borrow(farmer, lotId, 1_000e18, 2_000e6, 90);

        uint256 debtBefore = d.pool.debtOf(loanId);
        vm.warp(block.timestamp + elapsed);
        assertGe(d.pool.debtOf(loanId), debtBefore, "debt must never shrink while a loan sits untouched");
    }

    /**
     * @notice Whatever the price drop and however much a liquidator offers to repay: they receive at
     *         most what they repaid plus cashew's 7% reward, no kilogram is lost, and investors lose
     *         nothing while the collateral covers the debt.
     */
    function testFuzz_LiquidationTakesAtMostRepaidPlusReward(uint256 newPrice, uint256 maxRepay) public {
        uint256 lotId = _verifiedLot(farmer, CASHEW, 1_000e18, CommodityRegistry.Grade.A);
        _seedPool(100_000e6);
        uint256 loanId = _borrow(farmer, lotId, 1_000e18, 1_500e6, 30);

        newPrice = bound(newPrice, 1e6, 187e6); // up to $1.87/kg: at or past the 80% point
        // forge-lint: disable-next-line(unsafe-typecast)
        _movePrice(CASHEW, uint128(newPrice));
        vm.assume(d.pool.isLiquidatable(loanId));

        bool covered = d.pool.getCollateralValue(lotId, 1_000e18) >= d.pool.debtOf(loanId);
        uint256 assetsBefore = d.pool.totalAssets();
        (uint256 quoted,, bool closes) = d.pool.liquidationQuote(loanId);
        // A partial liquidation accepts any limit; closing needs at least the full cost.
        maxRepay = closes ? bound(maxRepay, quoted, type(uint256).max) : bound(maxRepay, 1, type(uint256).max);

        (uint256 paid, uint256 seized) = _liquidateAsOutsider(loanId, lotId, maxRepay);

        assertLe(paid, maxRepay, "never more than offered");
        assertLe(d.pool.getCollateralValue(lotId, seized), (paid * 10_700) / 10_000 + 1, "at most what was repaid + 7%");
        LendingPool.Loan memory loan = d.pool.getLoan(loanId);
        uint256 stillPledged = loan.status == LendingPool.LoanStatus.ACTIVE ? loan.collateralKg : 0;
        assertEq(seized + d.commodityToken.balanceOf(farmer, lotId) + stillPledged, 1_000e18, "no kilogram is lost");
        if (covered) assertGe(d.pool.totalAssets(), assetsBefore, "investors are made whole");
    }

    /// @dev An outside liquidator with plenty of USDC liquidates; returns what they paid and received.
    function _liquidateAsOutsider(uint256 _loanId, uint256 _lotId, uint256 _maxRepay)
        internal
        returns (uint256 paid, uint256 seized)
    {
        address liquidator = makeAddr("liquidator");
        usdc.mint(liquidator, 10_000e6);
        vm.startPrank(liquidator);
        usdc.approve(address(d.pool), type(uint256).max);
        d.pool.liquidate(_loanId, _maxRepay);
        vm.stopPrank();
        paid = 10_000e6 - usdc.balanceOf(liquidator);
        seized = d.commodityToken.balanceOf(liquidator, _lotId);
    }

    /// @notice A partial liquidation always leaves the loan healthier than it found it.
    function testFuzz_PartialLiquidationAlwaysLeavesTheLoanHealthier(uint256 newPrice, uint256 maxRepay) public {
        uint256 lotId = _verifiedLot(farmer, CASHEW, 1_000e18, CommodityRegistry.Grade.A);
        _seedPool(100_000e6);
        uint256 loanId = _borrow(farmer, lotId, 1_000e18, 1_500e6, 30);

        newPrice = bound(newPrice, 161e6, 187e6); // between debt + 7% and the 80% point
        // forge-lint: disable-next-line(unsafe-typecast)
        _movePrice(CASHEW, uint128(newPrice));
        vm.assume(d.pool.isLiquidatable(loanId));
        (,, bool closes) = d.pool.liquidationQuote(loanId);
        vm.assume(!closes);
        maxRepay = bound(maxRepay, 1e6, type(uint256).max);

        uint256 healthBefore = d.pool.getHealthFactor(loanId);
        address liquidator = makeAddr("liquidator");
        usdc.mint(liquidator, 1_500e6);
        vm.startPrank(liquidator);
        usdc.approve(address(d.pool), 1_500e6);
        d.pool.liquidate(loanId, maxRepay);
        vm.stopPrank();

        assertEq(uint8(d.pool.getLoan(loanId).status), uint8(LendingPool.LoanStatus.ACTIVE), "the loan stays open");
        assertGt(d.pool.getHealthFactor(loanId), healthBefore, "and is healthier");
        assertGe(d.pool.debtOf(loanId), d.pool.MIN_BORROW_AMOUNT(), "never leaves dust");
    }

    /// @notice Depositing never changes what existing shares are worth (no dilution, no gift).
    function testFuzz_DepositNeverMovesTheSharePrice(uint256 elapsed, uint256 amount) public {
        elapsed = bound(elapsed, 0, 300 days);
        amount = bound(amount, 1e6, 1_000_000e6);

        uint256 lotId = _verifiedLot(farmer, COCOA, 1_000e18, CommodityRegistry.Grade.A);
        _seedPool(50_000e6);
        _borrow(farmer, lotId, 1_000e18, 1_000e6, 300);
        vm.warp(block.timestamp + elapsed);

        uint256 priceBefore = d.pool.convertToAssets(1e18);
        usdc.mint(address(this), amount);
        usdc.approve(address(d.pool), amount);
        d.pool.deposit(amount);

        // Rounding the new shares down can only nudge the price up, by under a billionth.
        uint256 priceAfter = d.pool.convertToAssets(1e18);
        assertGe(priceAfter, priceBefore, "a deposit never dilutes existing investors");
        assertApproxEqRel(priceAfter, priceBefore, 1e9, "and never gifts them more than rounding");
    }
}
