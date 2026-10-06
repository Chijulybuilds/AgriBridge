// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {LendingPool} from "src/LendingPool.sol";
import {ProtocolFixture} from "test/utils/ProtocolFixture.sol";

/**
 * @title LendingPoolFuzzTest
 * @notice Property tests over the real contract set, covering deposit/withdraw round trips,
 *         collateral valuation scaling, and the loan-to-value ceiling.
 */
contract LendingPoolFuzzTest is ProtocolFixture {
    uint256 internal constant MAX_LTV_BPS = 7000; // 70%
    /// @dev $6.50/kg world price less cocoa's 15% basis cut, in 6 decimals.
    uint256 internal constant COCOA_USD_PER_KG_6DP = 5_525_000;

    function setUp() public {
        _deployFixture();
    }

    /**
     * @notice A lone depositor who immediately withdraws every share must get their USDC back.
     * @dev With no borrowing there is no interest and no reserve accrual, so the round trip is
     *      exact. Catches share-conversion rounding that would quietly skim depositors.
     */
    function testFuzz_DepositWithdrawRoundTripIsLossless(uint256 amount) public {
        amount = bound(amount, 1e6, 10_000_000e6);

        usdc.mint(investor, amount);

        vm.startPrank(investor);
        usdc.approve(address(d.pool), amount);
        d.pool.deposit(amount);

        uint256 shares = d.shareToken.balanceOf(investor);
        assertGt(shares, 0, "deposit must mint shares");

        d.pool.withdraw(shares);
        vm.stopPrank();

        assertEq(usdc.balanceOf(investor), amount, "round trip must return the full deposit");
        assertEq(d.shareToken.balanceOf(investor), 0, "all shares must be burned");
    }

    /// @notice Collateral valuation is linear in quantity and always in 6-decimal USD.
    function testFuzz_CollateralValueScalesWithQuantity(uint96 quantityKg) public {
        uint256 kg = bound(uint256(quantityKg), 1, 1_000_000);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint96 quantity = uint96(kg * 1e18);

        uint256 lotId = _verifiedLot(farmer, COCOA, quantity, CommodityRegistry.Grade.A);

        assertEq(
            d.pool.getCollateralValue(lotId, quantity),
            kg * COCOA_USD_PER_KG_6DP,
            "valuation must stay linear and 6-decimal"
        );
    }

    /**
     * @notice Any borrow the pool accepts must sit at or below the 70% loan-to-value ceiling, and no
     *         borrow below it may be rejected for LTV reasons.
     */
    function testFuzz_BorrowRespectsMaxLtv(uint256 quantityKg, uint256 borrowAmount) public {
        uint256 kg = bound(quantityKg, 100, 100_000);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint96 quantity = uint96(kg * 1e18);

        uint256 maxBorrow = (kg * COCOA_USD_PER_KG_6DP * MAX_LTV_BPS) / 10_000;

        // Stay inside the pool's own borrow bounds so we test the LTV rule, not the bounds check.
        vm.assume(maxBorrow > 100e6);
        borrowAmount = bound(borrowAmount, 100e6, maxBorrow);

        uint256 lotId = _verifiedLot(farmer, COCOA, quantity, CommodityRegistry.Grade.A);
        _seedPool(borrowAmount * 2 + 1_000e6);

        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.pool), true);
        uint256 loanId = d.pool.borrow(lotId, quantity, borrowAmount);
        vm.stopPrank();

        assertEq(usdc.balanceOf(farmer), borrowAmount);
        assertGe(d.pool.getHealthFactor(loanId), 1e18, "accepted loan must open at health factor >= 1");
    }

    /// @notice Borrowing above the ceiling must always be rejected.
    function testFuzz_BorrowAboveMaxLtvAlwaysReverts(uint256 quantityKg, uint256 excess) public {
        uint256 kg = bound(quantityKg, 100, 100_000);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint96 quantity = uint96(kg * 1e18);

        uint256 maxBorrow = (kg * COCOA_USD_PER_KG_6DP * MAX_LTV_BPS) / 10_000;

        vm.assume(maxBorrow > 100e6);
        excess = bound(excess, 1e6, 1_000_000e6);
        uint256 borrowAmount = maxBorrow + excess;
        vm.assume(borrowAmount <= 10_000_000e6);

        uint256 lotId = _verifiedLot(farmer, COCOA, quantity, CommodityRegistry.Grade.A);
        _seedPool(borrowAmount + 1_000_000e6);

        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.pool), true);
        vm.expectRevert(LendingPool.LendingPool__ExceedsMaxLTV.selector);
        d.pool.borrow(lotId, quantity, borrowAmount);
        vm.stopPrank();
    }

    /// @notice Debt never decreases as time passes on an untouched loan.
    function testFuzz_DebtIsMonotonicOverTime(uint256 elapsed) public {
        elapsed = bound(elapsed, 1, 365 days);

        uint96 quantity = 1_000e18;
        uint256 lotId = _verifiedLot(farmer, COCOA, quantity, CommodityRegistry.Grade.A);
        _seedPool(100_000e6);

        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.pool), true);
        uint256 loanId = d.pool.borrow(lotId, quantity, 3_500e6);
        vm.stopPrank();

        (,,,, uint256 debtBefore) = d.pool.getLoanDetails(loanId);
        vm.warp(block.timestamp + elapsed);
        (,,,, uint256 debtAfter) = d.pool.getLoanDetails(loanId);

        assertGe(debtAfter, debtBefore, "debt must never shrink while a loan sits untouched");
    }
}
