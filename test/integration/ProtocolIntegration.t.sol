// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {CommodityPriceOracle} from "src/CommodityPriceOracle.sol";
import {LendingPool} from "src/LendingPool.sol";
import {ProtocolFixture} from "test/utils/ProtocolFixture.sol";

/**
 * @title ProtocolIntegrationTest
 * @notice Wires the real contracts together exactly as deployment does and drives whole journeys:
 *         intake, verification by the Safe, deposit, borrow, decay, repay, liquidate, and the keeper.
 * @dev The unit tests price collateral through mocks; a mock shaped like the expected interface once
 *      hid a production defect, so these tests use the real contracts throughout.
 */
contract ProtocolIntegrationTest is ProtocolFixture {
    address internal regulator = makeAddr("regulator");
    address internal liquidator = makeAddr("liquidator");

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

    /// @dev Opens a $2,000 loan for 90 days against the whole cocoa lot (limit: $2,417.02).
    function _openLoan() internal returns (uint256 lotId, uint256 loanId) {
        lotId = _cocoaLot();
        _seedPool(INVESTOR_LIQUIDITY);
        loanId = _borrow(farmer, lotId, QUANTITY, 2_000e6, 90);
    }

    function _fundFarmerForInterest() internal {
        usdc.mint(farmer, 1_000e6);
        vm.prank(farmer);
        usdc.approve(address(d.pool), type(uint256).max);
    }

    /*//////////////////////////////////////////////////////////////
                            TOKENS AND VALUE
    //////////////////////////////////////////////////////////////*/

    function test_VerificationMintsCollateralToFarmer() public {
        uint256 lotId = _cocoaLot();
        assertEq(d.commodityToken.balanceOf(farmer, lotId), QUANTITY);
        assertTrue(d.registry.isUsable(lotId));
    }

    function test_InvestorDepositMintsShares() public {
        _seedPool(INVESTOR_LIQUIDITY);
        assertEq(usdc.balanceOf(address(d.pool)), INVESTOR_LIQUIDITY);
        assertEq(d.shareToken.balanceOf(investor), INVESTOR_LIQUIDITY);
    }

    /// @notice 1,000 kg of cocoa at $6.50 is $6,500 at the world price; less the 15% basis cut it
    ///         counts for $5,525. Soybeans: $400 less 10% is $360. Cashew is priced locally: $3,200.
    function test_EachCommodityIsValuedAtItsOwnPriceAndBasis() public {
        assertEq(d.pool.getCollateralValue(_cocoaLot(), QUANTITY), 5_525e6);

        uint256 soy = _verifiedLot(farmer, SOYBEANS, QUANTITY, CommodityRegistry.Grade.A);
        assertEq(d.pool.getCollateralValue(soy, QUANTITY), 360e6);

        uint256 cashew = _verifiedLot(farmer, CASHEW, QUANTITY, CommodityRegistry.Grade.A);
        assertEq(d.pool.getCollateralValue(cashew, QUANTITY), 3_200e6);
    }

    /// @notice Collateral loses value day by day as its grade ages.
    function test_CollateralValueDecaysWithGrade() public {
        uint256 lotId = _cocoaLot();
        vm.warp(block.timestamp + 90 days);
        d.oracle.setPrice(COCOA, COCOA_PRICE); // keep the price fresh
        // 87.5% decay times the 85% left after the basis cut, in whole basis points (7,437).
        assertEq(d.pool.getCollateralValue(lotId, QUANTITY), 4_834_050_000);

        vm.warp(block.timestamp + 90 days);
        d.oracle.setPrice(COCOA, COCOA_PRICE);
        assertEq(d.pool.getCollateralValue(lotId, QUANTITY), 4_143_750_000); // 75% x 85%
    }

    /*//////////////////////////////////////////////////////////////
                               BORROWING
    //////////////////////////////////////////////////////////////*/

    function test_FarmerCanBorrowAgainstTheRealOracle() public {
        (uint256 lotId, uint256 loanId) = _openLoan();

        assertEq(usdc.balanceOf(farmer), 2_000e6);
        assertEq(d.commodityToken.balanceOf(address(d.pool), lotId), QUANTITY);
        assertGt(d.pool.getHealthFactor(loanId), 1e18);
    }

    function test_BorrowRevertsAboveTheLimitAtMaturity() public {
        uint256 lotId = _cocoaLot();
        _seedPool(INVESTOR_LIQUIDITY);

        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.pool), true);
        vm.expectRevert(LendingPool.LendingPool__ExceedsMaxLTV.selector);
        d.pool.borrow(lotId, QUANTITY, 2_500e6, uint64(block.timestamp + 90 days));
        vm.stopPrank();
    }

    function test_BorrowRevertsOnStalePrice() public {
        uint256 lotId = _cocoaLot();
        _seedPool(INVESTOR_LIQUIDITY);
        vm.warp(block.timestamp + HEARTBEAT + 1);

        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.pool), true);
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceStale.selector);
        d.pool.borrow(lotId, QUANTITY, 1_000e6, uint64(block.timestamp + 30 days));
        vm.stopPrank();
    }

    function test_FrozenOrExpiredLotsCannotBackALoan() public {
        _seedPool(INVESTOR_LIQUIDITY);
        uint256 frozen = _cocoaLot();
        vm.prank(regulator);
        d.registry.setLotFrozen(frozen, true);

        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(d.pool), true);
        vm.expectRevert(LendingPool.LendingPool__CommodityNotApprovedForBorrowing.selector);
        d.pool.borrow(frozen, QUANTITY, 1_000e6, uint64(block.timestamp + 30 days));
        vm.stopPrank();

        uint256 expired = _cocoaLot();
        vm.warp(d.registry.expiresAt(expired));
        vm.expectRevert(LendingPool.LendingPool__CommodityNotApprovedForBorrowing.selector);
        vm.prank(farmer);
        d.pool.borrow(expired, QUANTITY, 1_000e6, uint64(block.timestamp + 30 days));
    }

    /// @notice Decay alone lowers a loan's health as time passes.
    function test_DecayLowersLoanHealth() public {
        (, uint256 loanId) = _openLoan();
        uint256 healthAtStart = d.pool.getHealthFactor(loanId);

        vm.warp(block.timestamp + 60 days);
        d.oracle.setPrice(COCOA, COCOA_PRICE);
        assertLt(d.pool.getHealthFactor(loanId), healthAtStart);
    }

    /*//////////////////////////////////////////////////////////////
                               REPAYMENT
    //////////////////////////////////////////////////////////////*/

    function test_RepayInFullReturnsTheCollateral() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        vm.warp(block.timestamp + 30 days);
        _fundFarmerForInterest();

        uint256 debt = d.pool.debtOf(loanId);
        assertGt(debt, 2_000e6, "interest accrued over 30 days");
        uint256 before = usdc.balanceOf(farmer);

        vm.prank(farmer);
        d.pool.repay(loanId, type(uint256).max);

        assertEq(before - usdc.balanceOf(farmer), debt, "charged exactly the debt");
        assertEq(d.commodityToken.balanceOf(farmer, lotId), QUANTITY);
        assertEq(uint8(d.pool.getLoan(loanId).status), uint8(LendingPool.LoanStatus.REPAID));
    }

    /// @notice Freezing a lot already locked in a loan does not trap the farmer's collateral.
    function test_RepayReturnsCollateralOfAFrozenLot() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        vm.prank(regulator);
        d.registry.setLotFrozen(lotId, true);
        _fundFarmerForInterest();

        vm.prank(farmer);
        d.pool.repay(loanId, type(uint256).max);
        assertEq(d.commodityToken.balanceOf(farmer, lotId), QUANTITY);
    }

    function test_TwoLoansAgainstOneLot() public {
        uint256 lotId = _cocoaLot();
        _seedPool(INVESTOR_LIQUIDITY);
        uint256 first = _borrow(farmer, lotId, QUANTITY / 2, 1_000e6, 60);
        uint256 second = _borrow(farmer, lotId, QUANTITY / 2, 1_000e6, 60);
        _fundFarmerForInterest();

        vm.startPrank(farmer);
        d.pool.repay(first, type(uint256).max);
        assertEq(d.commodityToken.balanceOf(farmer, lotId), QUANTITY / 2);
        d.pool.repay(second, type(uint256).max);
        vm.stopPrank();

        assertEq(d.commodityToken.balanceOf(farmer, lotId), QUANTITY);
        assertEq(d.pool.totalScaledDebt(), 0);
    }

    function test_SmallPaymentThenFullRepayment() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        vm.warp(block.timestamp + 80 days);
        _fundFarmerForInterest();

        vm.startPrank(farmer);
        d.pool.repay(loanId, 1e6); // $1, far less than the interest owed
        d.pool.repay(loanId, type(uint256).max);
        vm.stopPrank();

        assertEq(uint8(d.pool.getLoan(loanId).status), uint8(LendingPool.LoanStatus.REPAID));
        assertEq(d.pool.totalDebt(), 0);
        assertEq(d.commodityToken.balanceOf(farmer, lotId), QUANTITY);
    }

    /*//////////////////////////////////////////////////////////////
                              LIQUIDATION
    //////////////////////////////////////////////////////////////*/

    /// @notice After a crash, anyone pays the debt and takes debt + 5% of cocoa; the farmer keeps
    ///         the loan and gets the rest of the lot back.
    function test_LiquidationAfterAPriceCrash() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        d.oracle.forcePrice(COCOA, 280e6); // $2,380 of collateral against $2,000: 84%
        assertTrue(d.pool.isLiquidatable(loanId));

        uint256 debt = d.pool.debtOf(loanId);
        usdc.mint(liquidator, debt);
        vm.startPrank(liquidator);
        usdc.approve(address(d.pool), debt);
        d.pool.liquidate(loanId);
        vm.stopPrank();

        uint256 seized = d.commodityToken.balanceOf(liquidator, lotId);
        assertEq(seized, (uint256(QUANTITY) * 2_100e6) / 2_380e6, "$2,100 of cocoa");
        assertEq(d.commodityToken.balanceOf(farmer, lotId), QUANTITY - seized, "the rest goes back");
        assertEq(usdc.balanceOf(farmer), 2_000e6, "the farmer keeps the loan");
        assertEq(uint8(d.pool.getLoan(loanId).status), uint8(LendingPool.LoanStatus.LIQUIDATED));
    }

    /// @notice An unpaid loan becomes liquidatable a week after maturity; with no outside liquidator,
    ///         the Automation keeper liquidates it with reserves and investors are made whole.
    function test_OverdueLoanIsLiquidatedByTheKeeper() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        usdc.mint(address(this), 5_000e6);
        usdc.approve(address(d.pool), 5_000e6);
        d.pool.depositReserves(5_000e6);

        vm.warp(block.timestamp + 98 days); // maturity was day 90; grace ends day 97
        d.oracle.setPrice(COCOA, COCOA_PRICE);

        uint256 assetsBefore = d.pool.totalAssets();
        (bool needed, bytes memory performData) = d.keeper.checkUpkeep("");
        assertTrue(needed);
        d.keeper.performUpkeep(performData);

        assertEq(uint8(d.pool.getLoan(loanId).status), uint8(LendingPool.LoanStatus.LIQUIDATED));
        assertGt(d.pool.inventory(lotId), 0, "the protocol holds the seized cocoa to sell");
        assertGt(d.commodityToken.balanceOf(farmer, lotId), 0, "the farmer gets the rest back");
        assertEq(d.pool.totalAssets(), assetsBefore, "investors are made whole");
    }
}
