// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {LendingPool} from "src/LendingPool.sol";
import {LiquidationKeeper} from "src/LiquidationKeeper.sol";
import {ProtocolFixture} from "test/utils/ProtocolFixture.sol";

/**
 * @title LendingPoolLiquidationTest
 * @notice Liquidation at the 80% point or when overdue: partial liquidation that leaves the loan
 *         healthier, closing in full when it cannot, the per-commodity reward, bad debt absorbed by
 *         reserves, the reserve-funded backstop, and the Automation keeper.
 * @dev The worked example: a farmer borrows $2,000 against 1,000 kg of cashew (reward 7%). The price
 *      falls until the cashew is worth $2,500 (80% loan-to-value). A liquidator repays half, $1,000,
 *      and receives $1,070 of cashew (428 kg). The loan stays open: $1,000 against 572 kg worth
 *      $1,430, 70%, healthy again. Cashew is priced locally (no basis cut), so its value is simply
 *      price x kg x decay.
 */
contract LendingPoolLiquidationTest is ProtocolFixture {
    LendingPool internal pool;

    address internal liquidator = makeAddr("liquidator");
    address internal regulator = makeAddr("regulator");

    uint96 internal constant KG = 1_000e18;
    uint256 internal constant LOAN = 2_000e6;
    /// @dev Cashew's liquidation reward (CommodityDefaults).
    uint256 internal constant REWARD_BPS = 700;

    function setUp() public {
        _deployFixture();
        pool = d.pool;
        d.registry.grantRole(d.registry.REGULATOR_ROLE(), regulator);
        _seedPool(50_000e6);

        usdc.mint(liquidator, 10_000e6);
        vm.prank(liquidator);
        usdc.approve(address(pool), type(uint256).max);
    }

    /// @dev $4,010 of cashew (1,000 kg at $4.01) backs a loan due tomorrow.
    function _openLoan(uint256 _amount) internal returns (uint256 lotId, uint256 loanId) {
        _movePrice(CASHEW, 401e6);
        lotId = _verifiedLot(farmer, CASHEW, KG, CommodityRegistry.Grade.A);
        loanId = _borrow(farmer, lotId, KG, _amount, 1);
    }

    function _openLoan() internal returns (uint256 lotId, uint256 loanId) {
        return _openLoan(LOAN);
    }

    function _seedReserves(uint256 _amount) internal {
        usdc.mint(address(this), _amount);
        usdc.approve(address(pool), _amount);
        pool.depositReserves(_amount);
    }

    function _liquidate(uint256 _loanId) internal {
        vm.prank(liquidator);
        pool.liquidate(_loanId, type(uint256).max);
    }

    function _status(uint256 _loanId) internal view returns (uint8) {
        return uint8(pool.getLoan(_loanId).status);
    }

    /*//////////////////////////////////////////////////////////////
                         THE LIQUIDATION POINT
    //////////////////////////////////////////////////////////////*/

    function test_Liquidate_Revert_WhileHealthy() public {
        (, uint256 loanId) = _openLoan();
        _movePrice(CASHEW, 251e6); // $2,510: 79.7%, just short of 80%

        assertFalse(pool.isLiquidatable(loanId));
        vm.expectRevert(LendingPool.LendingPool__PositionHealthy.selector);
        _liquidate(loanId);
    }

    /*//////////////////////////////////////////////////////////////
                          PARTIAL LIQUIDATION
    //////////////////////////////////////////////////////////////*/

    /// @notice The worked example: half the debt is repaid, the loan stays open and is healthy again.
    function test_Liquidate_WorkedExample_RepaysHalfAndLeavesTheLoanHealthy() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        _movePrice(CASHEW, 250e6); // $2,500 of collateral against $2,000: 80%
        assertTrue(pool.isLiquidatable(loanId));
        assertEq(pool.getHealthFactor(loanId), 1e18);

        uint256 liquidatorUsdcBefore = usdc.balanceOf(liquidator);
        _liquidate(loanId);

        assertEq(liquidatorUsdcBefore - usdc.balanceOf(liquidator), 1_000e6, "repays half: $1,000");
        assertEq(d.commodityToken.balanceOf(liquidator, lotId), 428e18, "428 kg = $1,070: $1,000 + 7%");

        LendingPool.Loan memory loan = pool.getLoan(loanId);
        assertEq(uint8(loan.status), uint8(LendingPool.LoanStatus.ACTIVE), "the loan stays open");
        assertEq(loan.collateralKg, 572e18, "572 kg still pledged");
        assertApproxEqAbs(pool.debtOf(loanId), 1_000e6, 1, "$1,000 still owed");
        assertGt(pool.getHealthFactor(loanId), 1e18, "healthy again: $1,000 against $1,430");
        assertFalse(pool.isLiquidatable(loanId));
        assertEq(d.commodityToken.balanceOf(farmer, lotId), 0, "nothing is returned yet: the rest backs the loan");
        assertEq(usdc.balanceOf(farmer), LOAN, "and the farmer keeps the loan");
    }

    /// @notice Each partial liquidation leaves the loan healthier; a further fall can be settled again.
    function test_Liquidate_EachSettlementLeavesTheLoanHealthier() public {
        (, uint256 loanId) = _openLoan();
        _movePrice(CASHEW, 250e6);
        _liquidate(loanId);

        _movePrice(CASHEW, 200e6); // 572 kg now worth $1,144 against $1,000: 87%
        uint256 healthBefore = pool.getHealthFactor(loanId);
        assertTrue(pool.isLiquidatable(loanId));

        _liquidate(loanId);
        assertEq(_status(loanId), uint8(LendingPool.LoanStatus.ACTIVE));
        assertApproxEqAbs(pool.debtOf(loanId), 500e6, 1, "half of what remained");
        assertGt(pool.getHealthFactor(loanId), healthBefore, "healthier than before");
    }

    function test_Liquidate_IsOpenToAnyone() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        _movePrice(CASHEW, 240e6);

        address someone = makeAddr("someone");
        usdc.mint(someone, LOAN);
        vm.startPrank(someone);
        usdc.approve(address(pool), LOAN);
        pool.liquidate(loanId, type(uint256).max);
        vm.stopPrank();

        assertGt(d.commodityToken.balanceOf(someone, lotId), 0);
        assertApproxEqAbs(pool.debtOf(loanId), 1_000e6, 1);
    }

    /// @notice A liquidator can repay less than the close factor allows.
    function test_Liquidate_RespectsTheRepayLimit() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        _movePrice(CASHEW, 250e6);

        uint256 liquidatorUsdcBefore = usdc.balanceOf(liquidator);
        vm.prank(liquidator);
        pool.liquidate(loanId, 400e6);

        assertEq(liquidatorUsdcBefore - usdc.balanceOf(liquidator), 400e6);
        assertEq(d.commodityToken.balanceOf(liquidator, lotId), (uint256(KG) * 428e6) / 2_500e6, "$428 of cashew");
        assertApproxEqAbs(pool.debtOf(loanId), 1_600e6, 1);
    }

    function test_Liquidate_Revert_ZeroRepayLimit() public {
        (, uint256 loanId) = _openLoan();
        _movePrice(CASHEW, 250e6);

        vm.expectRevert(LendingPool.LendingPool__ZeroAmount.selector);
        vm.prank(liquidator);
        pool.liquidate(loanId, 0);
    }

    /*//////////////////////////////////////////////////////////////
                          CLOSING IN FULL
    //////////////////////////////////////////////////////////////*/

    /// @notice Below debt + reward, a partial repayment would leave the loan worse: it is closed instead.
    function test_Liquidate_ClosesWhenTheCropNoLongerCoversDebtPlusReward() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        _movePrice(CASHEW, 205e6); // $2,050: above the $2,000 debt, below $2,140

        uint256 assetsBefore = pool.totalAssets();
        _liquidate(loanId);

        assertEq(d.commodityToken.balanceOf(liquidator, lotId), KG, "takes it all");
        assertEq(d.commodityToken.balanceOf(farmer, lotId), 0);
        assertEq(_status(loanId), uint8(LendingPool.LoanStatus.LIQUIDATED));
        assertEq(pool.totalScaledDebt(), 0);
        assertEq(pool.activeLoanIds().length, 0);
        assertEq(pool.totalAssets(), assetsBefore, "investors are made whole");
    }

    /// @notice Closing costs the whole debt, so a lower repay limit is refused rather than ignored.
    function test_Liquidate_Revert_RepayLimitBelowAFullSettlement() public {
        (, uint256 loanId) = _openLoan();
        _movePrice(CASHEW, 205e6);

        vm.expectRevert(abi.encodeWithSelector(LendingPool.LendingPool__RepayLimitTooLow.selector, pool.debtOf(loanId)));
        vm.prank(liquidator);
        pool.liquidate(loanId, 1_000e6);
    }

    /// @notice Half of a $150 loan would leave $75, under the $100 minimum: the loan is closed.
    function test_Liquidate_ClosesWhenTheRemainderWouldBeTooSmall() public {
        (uint256 lotId, uint256 loanId) = _openLoan(150e6);
        _movePrice(CASHEW, 18e6); // $180 against $150: 83%, and above $150 + 7%

        uint256 liquidatorUsdcBefore = usdc.balanceOf(liquidator);
        _liquidate(loanId);

        assertEq(liquidatorUsdcBefore - usdc.balanceOf(liquidator), 150e6, "pays the whole $150");
        uint256 seized = d.commodityToken.balanceOf(liquidator, lotId);
        assertEq(seized, (uint256(KG) * 160_500_000) / 180e6, "$160.50 of cashew: $150 + 7%");
        assertEq(d.commodityToken.balanceOf(farmer, lotId), KG - seized, "the rest goes back");
        assertEq(_status(loanId), uint8(LendingPool.LoanStatus.LIQUIDATED));
    }

    /*//////////////////////////////////////////////////////////////
                                BAD DEBT
    //////////////////////////////////////////////////////////////*/

    /// @notice Collateral worth less than the debt: the liquidator still earns 7%, reserves absorb the gap.
    function test_Liquidate_BadDebtIsCoveredByReserves() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        _seedReserves(1_000e6);
        _movePrice(CASHEW, 180e6); // $1,800 against $2,000

        uint256 assetsBefore = pool.totalAssets();
        uint256 liquidatorUsdcBefore = usdc.balanceOf(liquidator);
        _liquidate(loanId);

        uint256 paid = liquidatorUsdcBefore - usdc.balanceOf(liquidator);
        assertEq(paid, 1_682_242_991, "$1,800 / 1.07, rounded up");
        assertEq(d.commodityToken.balanceOf(liquidator, lotId), KG);
        assertEq(pool.reserves(), 1_000e6 - (LOAN - paid), "reserves absorb the $317.76 shortfall");
        assertEq(pool.totalAssets(), assetsBefore, "investors lose nothing");
    }

    function test_Liquidate_BadDebtBeyondReservesFallsOnInvestors() public {
        (, uint256 loanId) = _openLoan();
        _movePrice(CASHEW, 180e6);

        uint256 assetsBefore = pool.totalAssets();
        _liquidate(loanId);

        assertEq(pool.reserves(), 0);
        assertEq(assetsBefore - pool.totalAssets(), LOAN - 1_682_242_991, "no reserves: investors take it");
    }

    /*//////////////////////////////////////////////////////////////
                                OVERDUE
    //////////////////////////////////////////////////////////////*/

    /// @notice An overdue loan is closed in full, however healthy: the end date has passed.
    function test_Liquidate_OverdueClosesTheLoanEvenWhenHealthy() public {
        (uint256 lotId, uint256 loanId) = _openLoan();

        vm.warp(block.timestamp + 1 days + 7 days + 1); // maturity plus the grace period
        _movePrice(CASHEW, 401e6); // a fresh, unchanged price
        assertGt(pool.getHealthFactor(loanId), 1e18, "still healthy");
        assertTrue(pool.isLiquidatable(loanId), "but overdue");

        _liquidate(loanId);

        uint256 seized = d.commodityToken.balanceOf(liquidator, lotId);
        assertGt(seized, 0);
        assertLt(seized, KG, "only debt + 7% is taken");
        assertEq(d.commodityToken.balanceOf(farmer, lotId), KG - seized);
        assertEq(_status(loanId), uint8(LendingPool.LoanStatus.LIQUIDATED));
    }

    function test_Liquidate_Revert_DuringTheGracePeriod() public {
        (, uint256 loanId) = _openLoan();
        vm.warp(block.timestamp + 1 days + 7 days);
        _movePrice(CASHEW, 401e6);

        vm.expectRevert(LendingPool.LendingPool__PositionHealthy.selector);
        _liquidate(loanId);
    }

    /*//////////////////////////////////////////////////////////////
                              THE QUOTE
    //////////////////////////////////////////////////////////////*/

    function test_LiquidationQuote() public {
        (, uint256 loanId) = _openLoan();
        (uint256 repay, uint256 kg, bool closes) = pool.liquidationQuote(loanId);
        assertEq(repay, 0, "healthy: nothing to liquidate");
        assertEq(kg, 0);
        assertFalse(closes);

        _movePrice(CASHEW, 250e6);
        (repay, kg, closes) = pool.liquidationQuote(loanId);
        assertEq(repay, 1_000e6);
        assertEq(kg, 428e18);
        assertFalse(closes, "partial");

        _movePrice(CASHEW, 205e6);
        (repay, kg, closes) = pool.liquidationQuote(loanId);
        assertEq(repay, pool.debtOf(loanId));
        assertEq(kg, KG);
        assertTrue(closes);
    }

    /*//////////////////////////////////////////////////////////////
                              SAFEGUARDS
    //////////////////////////////////////////////////////////////*/

    /// @notice A frozen lot is under investigation: nobody can liquidate it until the regulator lifts it.
    function test_Liquidate_Revert_FrozenLot() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        _movePrice(CASHEW, 200e6);
        vm.prank(regulator);
        d.registry.setLotFrozen(lotId, true);

        vm.expectRevert(LendingPool.LendingPool__LotFrozen.selector);
        _liquidate(loanId);
        (uint256 repay,,) = pool.liquidationQuote(loanId);
        assertEq(repay, 0, "the quote says so too");
    }

    function test_Liquidate_Revert_WhenPaused() public {
        (, uint256 loanId) = _openLoan();
        _movePrice(CASHEW, 200e6);
        pool.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        _liquidate(loanId);
    }

    /*//////////////////////////////////////////////////////////////
                         RESERVE-FUNDED BACKSTOP
    //////////////////////////////////////////////////////////////*/

    function test_LiquidateWithReserves_KeeperOnly() public {
        (, uint256 loanId) = _openLoan();
        _movePrice(CASHEW, 250e6);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, liquidator, pool.KEEPER_ROLE()
            )
        );
        vm.prank(liquidator);
        pool.liquidateWithReserves(loanId);
    }

    /// @notice Reserves repay half the debt; the protocol keeps that cashew to sell; the loan stays open.
    function test_LiquidateWithReserves_MakesInvestorsWholeAndKeepsInventory() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        _seedReserves(5_000e6);
        _movePrice(CASHEW, 250e6);

        uint256 assetsBefore = pool.totalAssets();
        vm.prank(address(d.keeper));
        pool.liquidateWithReserves(loanId);

        assertEq(pool.reserves(), 4_000e6, "$1,000 of reserves used");
        assertEq(pool.inventory(lotId), 428e18);
        assertEq(pool.getLoan(loanId).collateralKg, 572e18, "the rest still backs the loan");
        assertFalse(pool.isLiquidatable(loanId));
        assertEq(pool.totalAssets(), assetsBefore, "investors are made whole");
    }

    function test_LiquidateWithReserves_Revert_NotEnoughReserves() public {
        (, uint256 loanId) = _openLoan();
        _seedReserves(900e6);
        _movePrice(CASHEW, 250e6);

        vm.expectRevert(LendingPool.LendingPool__InsufficientReserves.selector);
        vm.prank(address(d.keeper));
        pool.liquidateWithReserves(loanId);
    }

    function test_ReleaseInventory_ToSell() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        _seedReserves(5_000e6);
        _movePrice(CASHEW, 250e6);
        vm.prank(address(d.keeper));
        pool.liquidateWithReserves(loanId);

        address seller = makeAddr("clearanceDesk");
        pool.releaseInventory(lotId, 428e18, seller);
        assertEq(d.commodityToken.balanceOf(seller, lotId), 428e18);
        assertEq(pool.inventory(lotId), 0);

        vm.expectRevert(LendingPool.LendingPool__InsufficientInventory.selector);
        pool.releaseInventory(lotId, 1, seller);
    }

    /*//////////////////////////////////////////////////////////////
                         THE AUTOMATION KEEPER
    //////////////////////////////////////////////////////////////*/

    function test_Keeper_NothingToDo() public {
        _openLoan();
        (bool needed,) = d.keeper.checkUpkeep("");
        assertFalse(needed);
    }

    function test_Keeper_FindsAndLiquidatesDueLoans() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        _seedReserves(5_000e6);
        _movePrice(CASHEW, 250e6);

        (bool needed, bytes memory performData) = d.keeper.checkUpkeep("");
        assertTrue(needed);
        uint256[] memory due = abi.decode(performData, (uint256[]));
        assertEq(due.length, 1);
        assertEq(due[0], loanId);

        d.keeper.performUpkeep(performData);
        assertEq(pool.inventory(lotId), 428e18);
        assertEq(_status(loanId), uint8(LendingPool.LoanStatus.ACTIVE), "settled in part, healthy again");
        (needed,) = d.keeper.checkUpkeep("");
        assertFalse(needed, "nothing more to do");
    }

    /// @notice Too little gas reverts the run rather than letting the liquidation fail and be "skipped",
    ///         so a wallet's gas estimate for a manual run always covers the liquidation.
    function test_Keeper_RevertsWithoutEnoughGasInsteadOfSkipping() public {
        (uint256 lotId,) = _openLoan();
        _seedReserves(5_000e6);
        _movePrice(CASHEW, 250e6);
        (, bytes memory performData) = d.keeper.checkUpkeep("");

        vm.expectRevert(LiquidationKeeper.LiquidationKeeper__NotEnoughGas.selector);
        d.keeper.performUpkeep{gas: 200_000}(performData);
        assertEq(pool.inventory(lotId), 0, "nothing skipped");

        d.keeper.performUpkeep{gas: 400_000}(performData);
        assertEq(pool.inventory(lotId), 428e18, "the gas kept back is enough");
    }

    /// @notice A loan repaid between the check and the run is skipped, not reverted.
    function test_Keeper_SkipsLoansNoLongerDue() public {
        (, uint256 loanId) = _openLoan();
        _seedReserves(5_000e6);
        _movePrice(CASHEW, 250e6);
        (, bytes memory performData) = d.keeper.checkUpkeep("");

        usdc.mint(farmer, 100e6);
        vm.startPrank(farmer);
        usdc.approve(address(pool), type(uint256).max);
        pool.repay(loanId, type(uint256).max);
        vm.stopPrank();

        d.keeper.performUpkeep(performData);
        assertEq(_status(loanId), uint8(LendingPool.LoanStatus.REPAID));
    }
}
