// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CommodityConfig} from "src/CommodityConfig.sol";
import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {LendingPool} from "src/LendingPool.sol";
import {ProtocolFixture} from "test/utils/ProtocolFixture.sol";

/**
 * @title LendingPoolCreditTest
 * @notice On-chain credit history: what counts on a borrower's record, and the borrow-limit reward a
 *         good record earns.
 * @dev The worked example: a farmer repays three cashew advances in full, each after more than a week
 *      and before its end date. Their record shows three on-time repayments and nothing against them,
 *      so their cashew limit rises from 50% to 55% of the crop's value at the end date. Against
 *      1,000 kg of cashew worth about $3,200, that is about $160 more.
 */
contract LendingPoolCreditTest is ProtocolFixture {
    LendingPool internal pool;

    address internal liquidator = makeAddr("liquidator");
    address internal newcomer = makeAddr("newcomer");

    uint96 internal constant KG = 1_000e18;
    uint256 internal constant ADVANCE = 500e6;
    uint256 internal constant TERM_DAYS = 30;

    event CreditUpdated(
        address indexed borrower, uint256 indexed loanId, uint256 onTime, uint256 late, uint256 settled
    );

    function setUp() public {
        _deployFixture();
        pool = d.pool;
        _seedPool(100_000e6);
        // The record is built over weeks, so cashew's price must stay fresh that long.
        d.oracle.setHeartbeat(CASHEW, 365 days);

        _fund(farmer);
        _fund(newcomer);
        _fund(liquidator);
    }

    function _fund(address _who) internal {
        usdc.mint(_who, 100_000e6);
        vm.prank(_who);
        usdc.approve(address(pool), type(uint256).max);
    }

    /// @dev `_who` takes a 30-day advance against 1,000 kg of a cashew lot, repaying it after `_days`.
    function _cycle(address _who, uint256 _lotId, uint256 _days) internal returns (uint256 loanId) {
        loanId = _borrow(_who, _lotId, KG, ADVANCE, TERM_DAYS);
        vm.warp(block.timestamp + _days * 1 days);
        vm.prank(_who);
        pool.repay(loanId, type(uint256).max);
    }

    function _record(address _who) internal view returns (uint256 onTime, uint256 late, uint256 settled, bool bonus) {
        return pool.creditOf(_who);
    }

    /// @dev Three advances repaid on time: enough for the bonus.
    function _goodRecord(address _who) internal returns (uint256 lotId) {
        lotId = _verifiedLot(_who, CASHEW, KG, CommodityRegistry.Grade.A);
        for (uint256 i = 0; i < 3; i++) {
            _cycle(_who, lotId, 8);
        }
    }

    /*//////////////////////////////////////////////////////////////
                           WHAT COUNTS
    //////////////////////////////////////////////////////////////*/

    function test_Credit_ANewBorrowerHasNoRecordAndTheBaseLimit() public {
        uint256 lotId = _verifiedLot(newcomer, CASHEW, KG, CommodityRegistry.Grade.A);
        (uint256 onTime, uint256 late, uint256 settled, bool bonus) = _record(newcomer);
        assertEq(onTime + late + settled, 0);
        assertFalse(bonus);
        assertEq(pool.maxLtvFor(newcomer, lotId), 5_000);
    }

    function test_Credit_AnOnTimeRepaymentCounts() public {
        uint256 lotId = _verifiedLot(farmer, CASHEW, KG, CommodityRegistry.Grade.A);
        uint256 loanId = _borrow(farmer, lotId, KG, ADVANCE, TERM_DAYS);
        vm.warp(block.timestamp + 8 days);

        vm.expectEmit(true, true, false, true, address(pool));
        emit CreditUpdated(farmer, loanId, 1, 0, 0);
        vm.prank(farmer);
        pool.repay(loanId, type(uint256).max);
    }

    /// @notice A loan repaid within a week says nothing about the borrower, so the record can't be farmed.
    function test_Credit_ARepaymentWithinAWeekDoesNotCount() public {
        uint256 lotId = _verifiedLot(farmer, CASHEW, KG, CommodityRegistry.Grade.A);
        _cycle(farmer, lotId, 1);
        _cycle(farmer, lotId, 6);
        (uint256 onTime,,,) = _record(farmer);
        assertEq(onTime, 0);
    }

    function test_Credit_ARepaymentAfterTheEndDateCountsAsLate() public {
        uint256 lotId = _verifiedLot(farmer, CASHEW, KG, CommodityRegistry.Grade.A);
        _cycle(farmer, lotId, TERM_DAYS + 2);
        (uint256 onTime, uint256 late,,) = _record(farmer);
        assertEq(onTime, 0);
        assertEq(late, 1);
    }

    /// @notice A partial repayment changes nothing; only repaying in full counts.
    function test_Credit_OnlyAFullRepaymentCounts() public {
        uint256 lotId = _verifiedLot(farmer, CASHEW, KG, CommodityRegistry.Grade.A);
        uint256 loanId = _borrow(farmer, lotId, KG, ADVANCE, TERM_DAYS);
        vm.warp(block.timestamp + 8 days);
        vm.prank(farmer);
        pool.repay(loanId, 100e6);
        (uint256 onTime,,,) = _record(farmer);
        assertEq(onTime, 0);
    }

    /// @notice Whoever pays, the credit goes to the borrower.
    function test_Credit_GoesToTheBorrowerNotThePayer() public {
        uint256 lotId = _verifiedLot(farmer, CASHEW, KG, CommodityRegistry.Grade.A);
        uint256 loanId = _borrow(farmer, lotId, KG, ADVANCE, TERM_DAYS);
        vm.warp(block.timestamp + 8 days);
        vm.prank(newcomer);
        pool.repay(loanId, type(uint256).max);

        (uint256 farmerOnTime,,,) = _record(farmer);
        (uint256 payerOnTime,,,) = _record(newcomer);
        assertEq(farmerOnTime, 1);
        assertEq(payerOnTime, 0);
    }

    /// @notice A loan liquidated twice in part, then repaid, counts once, as settled, and never as on time.
    function test_Credit_ALiquidatedLoanCountsOnceAsSettled() public {
        _movePrice(CASHEW, 420e6); // enough for $2,000 after a month of ageing
        uint256 lotId = _verifiedLot(farmer, CASHEW, KG, CommodityRegistry.Grade.A);
        uint256 loanId = _borrow(farmer, lotId, KG, 2_000e6, TERM_DAYS);

        _movePrice(CASHEW, 250e6); // $2,500 of cashew against $2,000: 80%
        vm.prank(liquidator);
        pool.liquidate(loanId, type(uint256).max);
        _movePrice(CASHEW, 200e6); // what's left is at risk again
        vm.prank(liquidator);
        pool.liquidate(loanId, type(uint256).max);
        assertEq(uint8(pool.getLoan(loanId).status), uint8(LendingPool.LoanStatus.ACTIVE), "still open");

        vm.warp(block.timestamp + 8 days);
        vm.prank(farmer);
        pool.repay(loanId, type(uint256).max);

        (uint256 onTime, uint256 late, uint256 settled, bool bonus) = _record(farmer);
        assertEq(settled, 1);
        assertEq(onTime + late, 0);
        assertFalse(bonus);
    }

    /*//////////////////////////////////////////////////////////////
                             THE REWARD
    //////////////////////////////////////////////////////////////*/

    /// @notice The worked example: three on-time repayments lift the cashew limit from 50% to 55%.
    function test_Credit_ThreeOnTimeRepaymentsRaiseTheLimitFivePoints() public {
        uint256 lotId = _goodRecord(farmer);
        (uint256 onTime,,, bool bonus) = _record(farmer);
        assertEq(onTime, 3);
        assertTrue(bonus);
        assertEq(pool.maxLtvFor(farmer, lotId), 5_500);

        uint64 maturity = uint64(block.timestamp + TERM_DAYS * 1 days);
        uint256 base = pool.maxBorrow(lotId, KG, maturity);
        uint256 raised = pool.maxBorrowFor(farmer, lotId, KG, maturity);
        assertApproxEqAbs(raised, (base * 5_500) / 5_000, 1, "10% more than the base limit");

        // The farmer can borrow above the base limit; a newcomer with the same crop can't.
        _borrow(farmer, lotId, KG, base + 50e6, TERM_DAYS);

        uint256 newcomerLot = _verifiedLot(newcomer, CASHEW, KG, CommodityRegistry.Grade.A);
        vm.startPrank(newcomer);
        d.commodityToken.setApprovalForAll(address(pool), true);
        vm.expectRevert(LendingPool.LendingPool__ExceedsMaxLTV.selector);
        pool.borrow(newcomerLot, KG, base + 50e6, maturity);
        vm.stopPrank();
    }

    /// @notice Late and settled loans count against on-time ones: the bonus needs a net record of three.
    function test_Credit_LateRepaymentsOffsetOnTimeOnes() public {
        uint256 lotId = _goodRecord(farmer);
        _cycle(farmer, lotId, TERM_DAYS + 1); // one late
        (,,, bool bonus) = _record(farmer);
        assertFalse(bonus, "3 on time, 1 late: not yet");

        _cycle(farmer, lotId, 8);
        (,,, bonus) = _record(farmer);
        assertTrue(bonus, "4 on time, 1 late: earned back");
    }

    /// @notice The bonus never takes more than half the gap to the liquidation point.
    function test_Credit_TheBonusIsCappedAtHalfTheGap() public {
        uint256 lotId = _goodRecord(farmer);
        CommodityConfig.Commodity memory cashew = d.config.getCommodity(CASHEW);
        cashew.maxLtvBps = 7_500; // a gap of 5 points to the 80% liquidation point
        d.config.updateCommodity(CASHEW, cashew);

        assertEq(pool.maxLtvFor(farmer, lotId), 7_750, "2.5 points, not 5");
    }

    /**
     * @notice Whatever a commodity's limits, a good record never lifts the borrow limit to the
     *         liquidation point: it adds at most 5 points and leaves at least half the gap.
     */
    function testFuzz_Credit_TheLimitStaysBelowTheLiquidationPoint(uint16 maxLtv, uint16 liqLtv) public {
        uint256 lotId = _goodRecord(farmer);
        CommodityConfig.Commodity memory cashew = d.config.getCommodity(CASHEW);
        liqLtv = uint16(bound(liqLtv, 2, 9_300)); // 93% x 1.07 reward stays below 100%
        maxLtv = uint16(bound(maxLtv, 1, liqLtv - 1));
        cashew.maxLtvBps = maxLtv;
        cashew.liquidationLtvBps = liqLtv;
        d.config.updateCommodity(CASHEW, cashew);

        uint256 limit = pool.maxLtvFor(farmer, lotId);
        assertGe(limit, maxLtv);
        assertLe(limit, uint256(maxLtv) + pool.CREDIT_BONUS_BPS());
        assertLe(2 * limit, uint256(maxLtv) + liqLtv, "at least half the gap remains");
        assertLt(limit, liqLtv);
    }
}
