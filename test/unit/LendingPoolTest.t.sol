// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {CommodityPriceOracle} from "src/CommodityPriceOracle.sol";
import {LendingPool} from "src/LendingPool.sol";
import {ProtocolFixture} from "test/utils/ProtocolFixture.sol";

/**
 * @title LendingPoolTest
 * @notice Deposits, borrowing rules, repayment, interest and reserves, on the real contracts.
 * @dev Most loans here are against cashew: priced locally, so no basis cut, and Grade B at 270 days.
 *      1,000 kg at $3.20 is $3,200 today; at a 90-day maturity it will have decayed to 91.67%.
 */
contract LendingPoolTest is ProtocolFixture {
    LendingPool internal pool;

    address internal regulator = makeAddr("regulator");
    address internal stranger = makeAddr("stranger");

    uint96 internal constant KG = 1_000e18;

    function setUp() public {
        _deployFixture();
        pool = d.pool;
        d.registry.grantRole(d.registry.REGULATOR_ROLE(), regulator);
    }

    function _cashewLot() internal returns (uint256) {
        return _verifiedLot(farmer, CASHEW, KG, CommodityRegistry.Grade.A);
    }

    function _withdrawAllNextBlock(address _investor) internal {
        vm.roll(block.number + 1);
        uint256 shares = d.shareToken.balanceOf(_investor);
        vm.prank(_investor);
        pool.withdraw(shares);
    }

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    function test_Constructor_Revert_ZeroAddress() public {
        vm.expectRevert(LendingPool.LendingPool__ZeroAddress.selector);
        new LendingPool(
            address(this),
            address(usdc),
            address(d.registry),
            address(d.commodityToken),
            address(d.shareToken),
            address(d.oracle),
            address(0)
        );
    }

    function test_Constructor_WiresEverything() public view {
        assertTrue(pool.hasRole(pool.DEFAULT_ADMIN_ROLE(), address(this)));
        assertTrue(pool.hasRole(pool.KEEPER_ROLE(), address(d.keeper)));
        assertEq(address(pool.i_config()), address(d.config));
        assertEq(pool.borrowIndex(), 1e18);
    }

    /*//////////////////////////////////////////////////////////////
                               INVESTORS
    //////////////////////////////////////////////////////////////*/

    function test_Deposit_MintsOneToOneAtStart() public {
        _seedPool(10_000e6);

        assertEq(d.shareToken.balanceOf(investor), 10_000e6);
        assertEq(pool.cash(), 10_000e6);
        assertEq(pool.totalAssets(), 10_000e6);
    }

    function test_Deposit_Revert_Zero() public {
        vm.expectRevert(LendingPool.LendingPool__ZeroAmount.selector);
        pool.deposit(0);
    }

    function test_Withdraw_ReturnsTheDeposit() public {
        _seedPool(10_000e6);
        _withdrawAllNextBlock(investor);

        assertEq(usdc.balanceOf(investor), 10_000e6);
        assertEq(d.shareToken.totalSupply(), 0);
    }

    function test_Withdraw_Revert_MoreThanIsNotLentOut() public {
        _seedPool(3_000e6);
        uint256 lotId = _cashewLot();
        _borrow(farmer, lotId, KG, 1_400e6, 90);

        vm.roll(block.number + 1);
        uint256 shares = d.shareToken.balanceOf(investor);
        vm.expectRevert(LendingPool.LendingPool__InsufficientPoolCash.selector);
        vm.prank(investor);
        pool.withdraw(shares);
    }

    /*//////////////////////////////////////////////////////////////
                             BORROWING RULES
    //////////////////////////////////////////////////////////////*/

    function test_Borrow_OpensALoan() public {
        _seedPool(10_000e6);
        uint256 lotId = _cashewLot();
        uint64 maturity = uint64(block.timestamp + 90 days);

        uint256 loanId = _borrow(farmer, lotId, KG, 1_400e6, 90);

        LendingPool.Loan memory loan = pool.getLoan(loanId);
        assertEq(loan.borrower, farmer);
        assertEq(loan.lotId, lotId);
        assertEq(loan.collateralKg, KG);
        assertEq(loan.principal, 1_400e6);
        assertEq(loan.maturity, maturity);
        assertEq(uint8(loan.status), uint8(LendingPool.LoanStatus.ACTIVE));
        assertEq(pool.debtOf(loanId), 1_400e6);

        assertEq(usdc.balanceOf(farmer), 1_400e6);
        assertEq(d.commodityToken.balanceOf(address(pool), lotId), KG);
        assertEq(pool.cash(), 8_600e6);
        assertEq(pool.activeLoanIds().length, 1);
        assertEq(pool.getBorrowerLoans(farmer)[0], loanId);
    }

    /// @notice The limit is 50% of what the collateral will be worth at maturity, not today.
    function test_Borrow_LimitUsesTheValueAtMaturity() public {
        _seedPool(10_000e6);
        uint256 lotId = _cashewLot();

        // At day 90 cashew has decayed to 91.67%: 1,000 kg is worth $2,933.44, so the limit is $1,466.72.
        uint64 maturity = uint64(block.timestamp + 90 days);
        assertEq(pool.getCollateralValue(lotId, KG), 3_200e6);
        assertEq(pool.maxBorrow(lotId, KG, maturity), 1_466_720_000);

        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(pool), true);
        vm.expectRevert(LendingPool.LendingPool__ExceedsMaxLTV.selector);
        pool.borrow(lotId, KG, 1_466_720_001, maturity);

        pool.borrow(lotId, KG, 1_466_720_000, maturity);
        vm.stopPrank();
    }

    function test_Borrow_LongerTermMeansALowerLimit() public {
        uint256 lotId = _cashewLot();
        uint256 short = pool.maxBorrow(lotId, KG, uint64(block.timestamp + 30 days));
        uint256 long = pool.maxBorrow(lotId, KG, uint64(block.timestamp + 360 days));
        assertGt(short, long);
    }

    function test_Borrow_YamHasALowerLimit() public {
        // Yam: 40% loan limit, Grade B after 60 days. 1,000 kg at $0.85 decays to 87.5% by day 30.
        uint256 lotId = _verifiedLot(farmer, YAM, KG, CommodityRegistry.Grade.A);
        assertEq(pool.maxBorrow(lotId, KG, uint64(block.timestamp + 30 days)), 297_500_000); // $297.50
    }

    function test_Borrow_PartOfALot() public {
        _seedPool(10_000e6);
        uint256 lotId = _cashewLot();

        _borrow(farmer, lotId, 400e18, 500e6, 90);

        assertEq(d.commodityToken.balanceOf(farmer, lotId), 600e18, "the rest stays with the farmer");
        assertEq(d.commodityToken.balanceOf(address(pool), lotId), 400e18);
    }

    /// @notice Tokens bought from a farmer can back a loan too: the collateral is the token, not the person.
    function test_Borrow_AnyHolderCanBorrow() public {
        _seedPool(10_000e6);
        uint256 lotId = _cashewLot();
        vm.prank(farmer);
        d.commodityToken.safeTransferFrom(farmer, stranger, lotId, 500e18, "");

        uint256 loanId = _borrow(stranger, lotId, 500e18, 500e6, 90);
        assertEq(pool.getLoan(loanId).borrower, stranger);
    }

    function test_Borrow_Revert_Bounds() public {
        uint256 lotId = _cashewLot();
        uint64 maturity = uint64(block.timestamp + 90 days);
        vm.startPrank(farmer);
        vm.expectRevert(LendingPool.LendingPool__InvalidLoanBounds.selector);
        pool.borrow(lotId, KG, 99e6, maturity);

        vm.expectRevert(LendingPool.LendingPool__InvalidLoanBounds.selector);
        pool.borrow(lotId, KG, 10_000_001e6, maturity);

        vm.expectRevert(LendingPool.LendingPool__ZeroAmount.selector);
        pool.borrow(lotId, 0, 500e6, maturity);
        vm.stopPrank();
    }

    function test_Borrow_Revert_NotEnoughCash() public {
        uint256 lotId = _cashewLot();
        vm.expectRevert(LendingPool.LendingPool__InsufficientPoolCash.selector);
        vm.prank(farmer);
        pool.borrow(lotId, KG, 500e6, uint64(block.timestamp + 90 days));
    }

    function test_Borrow_Revert_LotNotUsable() public {
        _seedPool(10_000e6);
        uint64 maturity = uint64(block.timestamp + 90 days);

        // Still pending: never verified.
        vm.prank(farmer);
        uint256 pending = d.registry.requestIntake(CASHEW, KG, warehouseId, uint64(block.timestamp));
        vm.expectRevert(LendingPool.LendingPool__CommodityNotApprovedForBorrowing.selector);
        vm.prank(farmer);
        pool.borrow(pending, KG, 500e6, maturity);

        // Frozen by the regulator.
        uint256 frozen = _cashewLot();
        vm.prank(regulator);
        d.registry.setLotFrozen(frozen, true);
        vm.expectRevert(LendingPool.LendingPool__CommodityNotApprovedForBorrowing.selector);
        vm.prank(farmer);
        pool.borrow(frozen, KG, 500e6, maturity);
    }

    function test_Borrow_Revert_InvalidMaturity() public {
        _seedPool(10_000e6);
        uint256 lotId = _cashewLot(); // cashew expires after 720 days
        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(pool), true);

        vm.expectRevert(LendingPool.LendingPool__InvalidMaturity.selector);
        pool.borrow(lotId, KG, 500e6, uint64(block.timestamp + 1 hours));

        // Must end at least 30 days before the lot expires.
        vm.expectRevert(LendingPool.LendingPool__InvalidMaturity.selector);
        pool.borrow(lotId, KG, 500e6, uint64(block.timestamp + 700 days));

        pool.borrow(lotId, KG, 500e6, uint64(block.timestamp + 690 days));
        vm.stopPrank();
    }

    function test_Borrow_Revert_NotEnoughTokens() public {
        _seedPool(10_000e6);
        uint256 lotId = _cashewLot();
        vm.expectRevert(LendingPool.LendingPool__InsufficientCollateralBalance.selector);
        vm.prank(farmer);
        pool.borrow(lotId, KG + 1, 500e6, uint64(block.timestamp + 90 days));
    }

    function test_Borrow_Revert_StalePrice() public {
        _seedPool(10_000e6);
        uint256 cocoa = _verifiedLot(farmer, COCOA, KG, CommodityRegistry.Grade.A);
        vm.warp(block.timestamp + HEARTBEAT + 1);

        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceStale.selector);
        vm.prank(farmer);
        pool.borrow(cocoa, KG, 500e6, uint64(block.timestamp + 90 days));
    }

    function test_Borrow_Revert_WhenPaused() public {
        _seedPool(10_000e6);
        uint256 lotId = _cashewLot();
        pool.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(farmer);
        pool.borrow(lotId, KG, 500e6, uint64(block.timestamp + 90 days));
    }

    /*//////////////////////////////////////////////////////////////
                               REPAYMENT
    //////////////////////////////////////////////////////////////*/

    function _openLoan() internal returns (uint256 lotId, uint256 loanId) {
        _seedPool(10_000e6);
        lotId = _cashewLot();
        loanId = _borrow(farmer, lotId, KG, 1_000e6, 90);
        usdc.mint(farmer, 1_000e6); // enough to cover interest
        vm.prank(farmer);
        usdc.approve(address(pool), type(uint256).max);
    }

    function test_Repay_InFullReturnsTheCollateral() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        vm.warp(block.timestamp + 30 days);
        uint256 debt = pool.debtOf(loanId);
        assertGt(debt, 1_000e6, "interest accrued");

        vm.prank(farmer);
        pool.repay(loanId, type(uint256).max);

        assertEq(uint8(pool.getLoan(loanId).status), uint8(LendingPool.LoanStatus.REPAID));
        assertEq(d.commodityToken.balanceOf(farmer, lotId), KG);
        assertEq(usdc.balanceOf(farmer), 2_000e6 - debt);
        assertEq(pool.totalScaledDebt(), 0);
        assertEq(pool.activeLoanIds().length, 0);
    }

    function test_Repay_PartialLowersTheDebt() public {
        (, uint256 loanId) = _openLoan();
        vm.prank(farmer);
        pool.repay(loanId, 400e6);

        assertEq(pool.debtOf(loanId), 600e6);
        assertEq(uint8(pool.getLoan(loanId).status), uint8(LendingPool.LoanStatus.ACTIVE));
    }

    function test_Repay_AnyoneCanPayAndTheBorrowerGetsTheCollateral() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        usdc.mint(stranger, 2_000e6);
        vm.startPrank(stranger);
        usdc.approve(address(pool), type(uint256).max);
        pool.repay(loanId, type(uint256).max);
        vm.stopPrank();

        assertEq(d.commodityToken.balanceOf(farmer, lotId), KG);
        assertEq(d.commodityToken.balanceOf(stranger, lotId), 0);
    }

    /// @notice Pausing stops new risk, never a borrower stopping their interest.
    function test_Repay_WorksWhilePaused() public {
        (, uint256 loanId) = _openLoan();
        pool.pause();

        vm.prank(farmer);
        pool.repay(loanId, type(uint256).max);
        assertEq(uint8(pool.getLoan(loanId).status), uint8(LendingPool.LoanStatus.REPAID));
    }

    function test_Repay_Revert_NotActive() public {
        (, uint256 loanId) = _openLoan();
        vm.startPrank(farmer);
        pool.repay(loanId, type(uint256).max);

        vm.expectRevert(LendingPool.LendingPool__LoanNotActive.selector);
        pool.repay(loanId, 1e6);

        vm.expectRevert(LendingPool.LendingPool__LoanNotActive.selector);
        pool.repay(99, 1e6);
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                          INTEREST AND RESERVES
    //////////////////////////////////////////////////////////////*/

    /// @notice Interest counts for investors as it accrues, not only when a loan is repaid.
    function test_Interest_CountsForInvestorsContinuously() public {
        _openLoan(); // $1,000 out of $10,000: 10% utilisation, 6% a year
        uint256 start = pool.totalAssets();

        vm.warp(block.timestamp + 365 days);
        // $60 of interest, $12 of it to reserves: investors are up $48 without any repayment.
        assertEq(pool.totalDebt(), 1_060e6);
        assertEq(pool.totalAssets(), start + 48e6);
    }

    function test_Interest_ReservesTakeTheirShareWhenBooked() public {
        (, uint256 loanId) = _openLoan();
        vm.warp(block.timestamp + 365 days);

        vm.prank(farmer);
        pool.repay(loanId, type(uint256).max); // books the accrual

        assertEq(pool.reserves(), 12e6, "20% of $60");
        assertEq(pool.totalAssets(), 10_048e6, "investors keep 80%");
    }

    function test_BorrowRate_FollowsTheKink() public {
        _seedPool(10_000e6);
        assertEq(pool.getBorrowRate(), 5e16, "5% with nothing lent");

        uint256 lotId = _verifiedLot(farmer, COCOA, 10_000e18, CommodityRegistry.Grade.A);
        _borrow(farmer, lotId, 10_000e18, 8_000e6, 30);

        assertEq(pool.utilization(), 80e16);
        assertEq(pool.getBorrowRate(), 13e16, "13% at the 80% kink");
        assertGt(pool.getSupplyRate(), 0);
    }

    function test_SetReserveFactor() public {
        pool.setReserveFactor(30e16);
        assertEq(pool.reserveFactor(), 30e16);

        vm.expectRevert(LendingPool.LendingPool__InvalidReserveFactor.selector);
        pool.setReserveFactor(51e16);
    }

    /*//////////////////////////////////////////////////////////////
                                 VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice At the liquidation price the loan reaches its liquidation point.
    function test_LiquidationPrice_IsWhereTheLoanTips() public {
        (, uint256 loanId) = _openLoan();
        uint256 tip = pool.liquidationPrice(loanId);
        assertGt(pool.getHealthFactor(loanId), 1e18);
        assertFalse(pool.isLiquidatable(loanId));

        d.oracle.forcePrice(CASHEW, uint128(tip + 1));
        assertFalse(pool.isLiquidatable(loanId));

        d.oracle.forcePrice(CASHEW, uint128(tip));
        assertTrue(pool.isLiquidatable(loanId));
        assertLe(pool.getHealthFactor(loanId), 1e18);
    }

    /*//////////////////////////////////////////////////////////////
                                 ADMIN
    //////////////////////////////////////////////////////////////*/

    function test_Reserves_DepositAndWithdraw() public {
        usdc.mint(address(this), 1_000e6);
        usdc.approve(address(pool), 1_000e6);
        pool.depositReserves(1_000e6);
        assertEq(pool.reserves(), 1_000e6);
        assertEq(pool.availableCash(), 0, "reserves are not lendable");

        pool.withdrawReserves(stranger, 400e6);
        assertEq(pool.reserves(), 600e6);
        assertEq(usdc.balanceOf(stranger), 400e6);

        vm.expectRevert(LendingPool.LendingPool__InsufficientReserves.selector);
        pool.withdrawReserves(stranger, 601e6);
    }

    function test_Admin_Revert_NotAdmin() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, pool.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(stranger);
        pool.pause();
    }

    function test_Fallback_AndReceive_Revert() public {
        vm.expectRevert(LendingPool.LendingPool__InvalidCall.selector);
        (bool ok,) = address(pool).call(abi.encodeWithSignature("nonExistent()"));
        ok;

        vm.deal(address(this), 1 ether);
        (bool sent,) = address(pool).call{value: 1 ether}("");
        assertFalse(sent);
    }
}
