// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {LendingPool} from "src/LendingPool.sol";
import {ProtocolFixture} from "test/utils/ProtocolFixture.sol";

/**
 * @title LendingPoolLiquidationTest
 * @notice Liquidation at the 80% point or when overdue, partial seizure with the leftover returned,
 *         bad debt absorbed by reserves, the reserve-funded backstop, and the Automation keeper.
 * @dev The team's worked example, scaled up 100x: a farmer borrows $2,000 against cashew; the price
 *      falls until the collateral is worth $2,500 (80% loan-to-value); the liquidator pays the $2,000
 *      and receives $2,100 of cashew; the farmer keeps the $2,000 and gets $400 of cashew back.
 *      Cashew is priced locally (no basis cut), so its value is simply price x kg x decay.
 */
contract LendingPoolLiquidationTest is ProtocolFixture {
    LendingPool internal pool;

    address internal liquidator = makeAddr("liquidator");
    address internal regulator = makeAddr("regulator");

    uint96 internal constant KG = 1_000e18;
    uint256 internal constant LOAN = 2_000e6;

    function setUp() public {
        _deployFixture();
        pool = d.pool;
        d.registry.grantRole(d.registry.REGULATOR_ROLE(), regulator);
        _seedPool(50_000e6);

        usdc.mint(liquidator, 10_000e6);
        vm.prank(liquidator);
        usdc.approve(address(pool), type(uint256).max);
    }

    /// @dev $4,010 of cashew (1,000 kg at $4.01) backs a $2,000 loan due tomorrow.
    function _openLoan() internal returns (uint256 lotId, uint256 loanId) {
        d.oracle.forcePrice(CASHEW, 401e6);
        lotId = _verifiedLot(farmer, CASHEW, KG, CommodityRegistry.Grade.A);
        loanId = _borrow(farmer, lotId, KG, LOAN, 1);
    }

    function _seedReserves(uint256 _amount) internal {
        usdc.mint(address(this), _amount);
        usdc.approve(address(pool), _amount);
        pool.depositReserves(_amount);
    }

    function _liquidate(uint256 _loanId) internal {
        vm.prank(liquidator);
        pool.liquidate(_loanId);
    }

    /*//////////////////////////////////////////////////////////////
                         THE LIQUIDATION POINT
    //////////////////////////////////////////////////////////////*/

    function test_Liquidate_Revert_WhileHealthy() public {
        (, uint256 loanId) = _openLoan();
        d.oracle.forcePrice(CASHEW, 251e6); // $2,510: 79.7%, just short of 80%

        assertFalse(pool.isLiquidatable(loanId));
        vm.expectRevert(LendingPool.LendingPool__PositionHealthy.selector);
        _liquidate(loanId);
    }

    /// @notice The worked example: the liquidator gets debt + 5% of cashew, the farmer the rest.
    function test_Liquidate_WorkedExample() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        d.oracle.forcePrice(CASHEW, 250e6); // $2,500 of collateral against $2,000: 80%

        assertTrue(pool.isLiquidatable(loanId));
        assertEq(pool.getHealthFactor(loanId), 1e18);

        uint256 liquidatorUsdcBefore = usdc.balanceOf(liquidator);
        _liquidate(loanId);

        assertEq(liquidatorUsdcBefore - usdc.balanceOf(liquidator), LOAN, "pays the $2,000 debt");
        assertEq(d.commodityToken.balanceOf(liquidator, lotId), 840e18, "840 kg = $2,100");
        assertEq(d.commodityToken.balanceOf(farmer, lotId), 160e18, "160 kg = $400 back to the farmer");
        assertEq(usdc.balanceOf(farmer), LOAN, "and the farmer keeps the loan");

        LendingPool.Loan memory loan = pool.getLoan(loanId);
        assertEq(uint8(loan.status), uint8(LendingPool.LoanStatus.LIQUIDATED));
        assertEq(pool.totalScaledDebt(), 0);
        assertEq(pool.activeLoanIds().length, 0);
    }

    function test_Liquidate_IsOpenToAnyone() public {
        (, uint256 loanId) = _openLoan();
        d.oracle.forcePrice(CASHEW, 240e6);

        address someone = makeAddr("someone");
        usdc.mint(someone, LOAN);
        vm.startPrank(someone);
        usdc.approve(address(pool), LOAN);
        pool.liquidate(loanId);
        vm.stopPrank();

        assertEq(uint8(pool.getLoan(loanId).status), uint8(LendingPool.LoanStatus.LIQUIDATED));
    }

    /// @notice Between the debt and debt + 5%: the liquidator pays the debt and takes everything.
    function test_Liquidate_ThinCushionTakesEverything() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        d.oracle.forcePrice(CASHEW, 205e6); // $2,050: above the $2,000 debt, below $2,100

        uint256 assetsBefore = pool.totalAssets();
        _liquidate(loanId);

        assertEq(d.commodityToken.balanceOf(liquidator, lotId), KG);
        assertEq(d.commodityToken.balanceOf(farmer, lotId), 0);
        assertEq(pool.totalAssets(), assetsBefore, "investors are made whole");
    }

    /*//////////////////////////////////////////////////////////////
                                BAD DEBT
    //////////////////////////////////////////////////////////////*/

    /// @notice Collateral worth less than the debt: the liquidator still earns 5%, reserves absorb the gap.
    function test_Liquidate_BadDebtIsCoveredByReserves() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        _seedReserves(1_000e6);
        d.oracle.forcePrice(CASHEW, 180e6); // $1,800 against $2,000

        uint256 assetsBefore = pool.totalAssets();
        uint256 liquidatorUsdcBefore = usdc.balanceOf(liquidator);
        _liquidate(loanId);

        uint256 paid = liquidatorUsdcBefore - usdc.balanceOf(liquidator);
        assertEq(paid, 1_714_285_714, "$1,800 / 1.05");
        assertEq(d.commodityToken.balanceOf(liquidator, lotId), KG);
        assertEq(pool.reserves(), 1_000e6 - (LOAN - paid), "reserves absorb the $285.71 shortfall");
        assertEq(pool.totalAssets(), assetsBefore, "investors lose nothing");
    }

    function test_Liquidate_BadDebtBeyondReservesFallsOnInvestors() public {
        (, uint256 loanId) = _openLoan();
        d.oracle.forcePrice(CASHEW, 180e6);

        uint256 assetsBefore = pool.totalAssets();
        _liquidate(loanId);

        assertEq(pool.reserves(), 0);
        assertEq(assetsBefore - pool.totalAssets(), LOAN - 1_714_285_714, "no reserves: investors take it");
    }

    /*//////////////////////////////////////////////////////////////
                                OVERDUE
    //////////////////////////////////////////////////////////////*/

    function test_Liquidate_OverdueEvenWhenHealthy() public {
        (uint256 lotId, uint256 loanId) = _openLoan();

        vm.warp(block.timestamp + 1 days + 7 days + 1); // maturity plus the grace period
        d.oracle.forcePrice(CASHEW, 401e6); // a fresh, unchanged price
        assertGt(pool.getHealthFactor(loanId), 1e18, "still healthy");
        assertTrue(pool.isLiquidatable(loanId), "but overdue");

        _liquidate(loanId);

        uint256 seized = d.commodityToken.balanceOf(liquidator, lotId);
        assertGt(seized, 0);
        assertLt(seized, KG, "only debt + 5% is taken");
        assertEq(d.commodityToken.balanceOf(farmer, lotId), KG - seized);
    }

    function test_Liquidate_Revert_DuringTheGracePeriod() public {
        (, uint256 loanId) = _openLoan();
        vm.warp(block.timestamp + 1 days + 7 days);
        d.oracle.forcePrice(CASHEW, 401e6);

        vm.expectRevert(LendingPool.LendingPool__PositionHealthy.selector);
        _liquidate(loanId);
    }

    /*//////////////////////////////////////////////////////////////
                              SAFEGUARDS
    //////////////////////////////////////////////////////////////*/

    /// @notice A frozen lot is under investigation: nobody can liquidate it until the regulator lifts it.
    function test_Liquidate_Revert_FrozenLot() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        d.oracle.forcePrice(CASHEW, 200e6);
        vm.prank(regulator);
        d.registry.setLotFrozen(lotId, true);

        vm.expectRevert(LendingPool.LendingPool__LotFrozen.selector);
        _liquidate(loanId);
    }

    function test_Liquidate_Revert_WhenPaused() public {
        (, uint256 loanId) = _openLoan();
        d.oracle.forcePrice(CASHEW, 200e6);
        pool.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        _liquidate(loanId);
    }

    /*//////////////////////////////////////////////////////////////
                         RESERVE-FUNDED BACKSTOP
    //////////////////////////////////////////////////////////////*/

    function test_LiquidateWithReserves_KeeperOnly() public {
        (, uint256 loanId) = _openLoan();
        d.oracle.forcePrice(CASHEW, 250e6);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, liquidator, pool.KEEPER_ROLE()
            )
        );
        vm.prank(liquidator);
        pool.liquidateWithReserves(loanId);
    }

    /// @notice Reserves repay investors at once; the protocol keeps the seized cashew to sell.
    function test_LiquidateWithReserves_MakesInvestorsWholeAndKeepsInventory() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        _seedReserves(5_000e6);
        d.oracle.forcePrice(CASHEW, 250e6);

        uint256 assetsBefore = pool.totalAssets();
        vm.prank(address(d.keeper));
        pool.liquidateWithReserves(loanId);

        assertEq(pool.reserves(), 3_000e6, "$2,000 of reserves used");
        assertEq(pool.inventory(lotId), 840e18);
        assertEq(d.commodityToken.balanceOf(farmer, lotId), 160e18, "the farmer still gets the rest back");
        assertEq(pool.totalAssets(), assetsBefore, "investors are made whole");
    }

    function test_LiquidateWithReserves_Revert_NotEnoughReserves() public {
        (, uint256 loanId) = _openLoan();
        _seedReserves(1_000e6);
        d.oracle.forcePrice(CASHEW, 250e6);

        vm.expectRevert(LendingPool.LendingPool__InsufficientReserves.selector);
        vm.prank(address(d.keeper));
        pool.liquidateWithReserves(loanId);
    }

    function test_ReleaseInventory_ToSell() public {
        (uint256 lotId, uint256 loanId) = _openLoan();
        _seedReserves(5_000e6);
        d.oracle.forcePrice(CASHEW, 250e6);
        vm.prank(address(d.keeper));
        pool.liquidateWithReserves(loanId);

        address seller = makeAddr("clearanceDesk");
        pool.releaseInventory(lotId, 840e18, seller);
        assertEq(d.commodityToken.balanceOf(seller, lotId), 840e18);
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
        d.oracle.forcePrice(CASHEW, 250e6);

        (bool needed, bytes memory performData) = d.keeper.checkUpkeep("");
        assertTrue(needed);
        uint256[] memory due = abi.decode(performData, (uint256[]));
        assertEq(due.length, 1);
        assertEq(due[0], loanId);

        d.keeper.performUpkeep(performData);
        assertEq(uint8(pool.getLoan(loanId).status), uint8(LendingPool.LoanStatus.LIQUIDATED));
        assertEq(pool.inventory(lotId), 840e18);
    }

    /// @notice A loan repaid between the check and the run is skipped, not reverted.
    function test_Keeper_SkipsLoansNoLongerDue() public {
        (, uint256 loanId) = _openLoan();
        _seedReserves(5_000e6);
        d.oracle.forcePrice(CASHEW, 250e6);
        (, bytes memory performData) = d.keeper.checkUpkeep("");

        usdc.mint(farmer, 100e6);
        vm.startPrank(farmer);
        usdc.approve(address(pool), type(uint256).max);
        pool.repay(loanId, type(uint256).max);
        vm.stopPrank();

        d.keeper.performUpkeep(performData);
        assertEq(uint8(pool.getLoan(loanId).status), uint8(LendingPool.LoanStatus.REPAID));
    }
}
