// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {LendingPool} from "src/LendingPool.sol";
import {Marketplace} from "src/Marketplace.sol";
import {ProtocolFixture} from "test/utils/ProtocolFixture.sol";

/**
 * @title WelcomeCreditTest
 * @notice Cheap to try: advances start at $25, and on a farmer's first advance the welcome fund pays
 *         the first 30 days of interest. A tenth of every marketplace fee fills the fund.
 * @dev The worked example: Musa delivers 5,000 kg of Grade A maize and takes $375 for 90 days from a
 *      $100,000 pool. That puts 0.375% of the pool out on loan, so the advance starts at 5.0375% a
 *      year, and 30 days of that on $375 is $1.55. The welcome fund pays it the moment the advance
 *      opens: Musa receives the full $375 but owes $373.45, which grows back to $375 by day 30.
 */
contract WelcomeCreditTest is ProtocolFixture {
    LendingPool internal pool;
    Marketplace internal market;

    address internal trader = makeAddr("trader");
    address internal buyer = makeAddr("buyer");
    address internal stranger = makeAddr("stranger");

    uint96 internal constant CROP = 5_000e18;
    uint256 internal constant ADVANCE = 375e6;
    uint256 internal constant POOL_LIQUIDITY = 100_000e6;
    uint256 internal constant FUND = 500e6;
    /// @dev 5% plus a tenth of the 0.375% of the pool that Musa's advance puts out on loan.
    uint256 internal constant STARTING_RATE = 5.0375e16;

    uint256 internal lotId;

    function setUp() public {
        _deployFixture();
        pool = d.pool;
        market = d.marketplace;
        // Weeks of chain time pass in these tests, so prices must stay fresh that long.
        d.oracle.setHeartbeat(MAIZE, 365 days);
        d.oracle.setHeartbeat(COCOA, 365 days);
        d.oracle.setHeartbeat(CASHEW, 365 days);
        _seedPool(POOL_LIQUIDITY);
        _fundWelcome(FUND);

        lotId = _verifiedLot(farmer, MAIZE, CROP, CommodityRegistry.Grade.A);
    }

    function _fundWelcome(uint256 _amount) internal {
        usdc.mint(address(this), _amount);
        usdc.approve(address(pool), _amount);
        pool.fundWelcome(_amount);
    }

    /// @dev 30 days of interest on `_amount` at the annual `_rate` (WAD), rounded down as the pool does.
    function _month(uint256 _amount, uint256 _rate) internal pure returns (uint256) {
        return (_amount * _rate * 30 days) / (1e18 * 365 days);
    }

    /*//////////////////////////////////////////////////////////////
                         THE FIRST MONTH FREE
    //////////////////////////////////////////////////////////////*/

    function test_FirstAdvance_TheWelcomeFundPaysTheFirstMonth() public {
        uint256 credit = _month(ADVANCE, STARTING_RATE);
        assertEq(credit, 1_552_654, "about $1.55");
        assertEq(pool.welcomeCreditFor(farmer, lotId, ADVANCE), _month(ADVANCE, 5e16), "quoted at today's 5%");

        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(pool), true);
        vm.expectEmit(true, true, false, true, address(pool));
        emit LendingPool.WelcomeCreditPaid(1, farmer, credit);
        uint256 loanId = pool.borrow(lotId, CROP, ADVANCE, uint64(block.timestamp + 90 days));
        vm.stopPrank();

        assertEq(usdc.balanceOf(farmer), ADVANCE, "Musa receives the full $375");
        assertApproxEqAbs(pool.debtOf(loanId), ADVANCE - credit, 1, "but owes $373.45");
        assertEq(pool.getLoan(loanId).principal, ADVANCE, "the advance is still $375");
        assertEq(pool.welcomeCredit(loanId), credit);
        assertTrue(pool.welcomeUsed(farmer));
        assertEq(pool.welcomeFund(), FUND - credit);
        assertEq(pool.welcomeCreditFor(farmer, lotId, ADVANCE), 0, "the offer is used");

        // The credit is a repayment: investors' money is unchanged, now partly cash, partly the loan.
        assertApproxEqAbs(pool.totalAssets(), POOL_LIQUIDITY, 1);

        vm.warp(block.timestamp + 30 days);
        uint256 owed = pool.debtOf(loanId);
        assertLe(owed, ADVANCE, "after 30 days Musa owes no more than he borrowed");
        assertApproxEqAbs(owed, ADVANCE, 0.01e6, "to within a cent");
    }

    /// @notice Investors still earn the month's interest: the welcome fund paid it instead of Musa.
    function test_FirstAdvance_InvestorsStillEarnTheMonth() public {
        uint256 loanId = _borrow(farmer, lotId, CROP, ADVANCE, 90);
        vm.warp(block.timestamp + 30 days);

        vm.startPrank(farmer);
        usdc.approve(address(pool), type(uint256).max);
        pool.repay(loanId, type(uint256).max);
        vm.stopPrank();

        assertEq(uint256(pool.getLoan(loanId).status), uint256(LendingPool.LoanStatus.REPAID));
        assertLe(usdc.balanceOf(farmer), 0.01e6, "the $375 he was paid covers the whole repayment");
        uint256 interest = _month(ADVANCE, STARTING_RATE);
        uint256 toInvestors = (interest * 80) / 100;
        assertApproxEqAbs(pool.totalAssets(), POOL_LIQUIDITY + toInvestors, 0.01e6, "80% of the month to investors");
        assertApproxEqAbs(pool.reserves(), interest - toInvestors, 0.01e6, "20% to reserves, as for any interest");
    }

    function test_FirstAdvance_OnlyOncePerFarmer() public {
        _borrow(farmer, lotId, 2_500e18, ADVANCE, 90);
        uint256 fundAfterFirst = pool.welcomeFund();

        uint256 second = _borrow(farmer, lotId, 2_500e18, ADVANCE, 90);
        assertEq(pool.welcomeCredit(second), 0, "the second advance pays its own interest");
        assertEq(pool.welcomeFund(), fundAfterFirst);
        assertApproxEqAbs(pool.debtOf(second), ADVANCE, 1);
    }

    /// @notice Crop tokens can be passed on, so the offer follows the farmer who delivered the crop.
    function test_FirstAdvance_OnlyForTheFarmerWhoDeliveredTheCrop() public {
        vm.prank(farmer);
        d.commodityToken.safeTransferFrom(farmer, trader, lotId, 2_500e18, "");

        assertEq(pool.welcomeCreditFor(trader, lotId, ADVANCE), 0);
        uint256 traderLoan = _borrow(trader, lotId, 2_500e18, ADVANCE, 90);
        assertEq(pool.welcomeCredit(traderLoan), 0, "a trader holding someone else's crop gets none");
        assertFalse(pool.welcomeUsed(trader));
        assertEq(pool.welcomeFund(), FUND);

        uint256 farmerLoan = _borrow(farmer, lotId, 2_500e18, ADVANCE, 90);
        assertGt(pool.welcomeCredit(farmerLoan), 0, "Musa still has his");
    }

    /// @notice With the fund empty the advance opens as normal, and the farmer keeps the offer.
    function test_FirstAdvance_AnEmptyFundKeepsTheOfferForLater() public {
        pool.withdrawWelcome(address(this), FUND);

        uint256 first = _borrow(farmer, lotId, 2_500e18, ADVANCE, 90);
        assertEq(pool.welcomeCredit(first), 0);
        assertFalse(pool.welcomeUsed(farmer), "nothing was paid, so the offer stands");

        _fundWelcome(FUND);
        uint256 next = _borrow(farmer, lotId, 2_500e18, ADVANCE, 90);
        assertGt(pool.welcomeCredit(next), 0);
        assertTrue(pool.welcomeUsed(farmer));
    }

    /// @notice What is left in the fund is all it can pay.
    function test_FirstAdvance_ALowFundPaysWhatItHas() public {
        pool.withdrawWelcome(address(this), FUND - 1e6);

        uint256 loanId = _borrow(farmer, lotId, CROP, ADVANCE, 90);
        assertEq(pool.welcomeCredit(loanId), 1e6, "the last $1");
        assertEq(pool.welcomeFund(), 0);
        assertTrue(pool.welcomeUsed(farmer));
    }

    /**
     * @notice A big first advance is capped: $20,000 of cocoa puts 20% of the pool out on loan, so it
     *         starts at 7% a year, and 30 days of that is $115. The fund pays $50.
     */
    function test_FirstAdvance_CappedAtFiftyDollars() public {
        uint256 cocoaLot = _verifiedLot(farmer, COCOA, 10_000e18, CommodityRegistry.Grade.A);
        assertGt(_month(20_000e6, 7e16), 115e6);

        uint256 loanId = _borrow(farmer, cocoaLot, 10_000e18, 20_000e6, 90);
        assertEq(pool.welcomeCredit(loanId), pool.WELCOME_MAX_CREDIT());
        assertEq(pool.WELCOME_MAX_CREDIT(), 50e6);
    }

    /// @notice Get paid today, sell at your price: an advance taken while listing gets it too.
    function test_FirstAdvance_AlsoWhenListingWithAnAdvance() public {
        uint256 cashewLot = _verifiedLot(farmer, CASHEW, 2_000e18, CommodityRegistry.Grade.A);
        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(market), true);
        (, uint256 loanId) = market.listWithAdvance(
            cashewLot,
            2_000e18,
            Marketplace.PriceMode.Fixed,
            3_300_000,
            0,
            0,
            3_000e6,
            uint64(block.timestamp + 60 days)
        );
        vm.stopPrank();

        // $3,000 puts 3% of the pool out on loan: 5.3% a year, and 30 days of that is $13.07.
        assertEq(pool.welcomeCredit(loanId), _month(3_000e6, 5.3e16));
        assertEq(usdc.balanceOf(farmer), 3_000e6, "the farmer is paid the full advance");
    }

    /*//////////////////////////////////////////////////////////////
                           THE WELCOME FUND
    //////////////////////////////////////////////////////////////*/

    /// @notice A $1,000 sale carries a $10 fee: $5 to investors, $1 to the welcome fund, $4 to the treasury.
    function test_Fees_FillTheWelcomeFund() public {
        uint256 cashewLot = _verifiedLot(stranger, CASHEW, 1_000e18, CommodityRegistry.Grade.A);
        vm.startPrank(stranger);
        d.commodityToken.setApprovalForAll(address(market), true);
        uint256 listingId = market.list(cashewLot, 1_000e18, Marketplace.PriceMode.Fixed, 1e6, 0, 0);
        vm.stopPrank();

        usdc.mint(buyer, 1_010e6);
        vm.startPrank(buyer);
        usdc.approve(address(market), 1_010e6);
        market.buy(listingId, 1_000e18, type(uint256).max);
        vm.stopPrank();

        assertEq(pool.welcomeFund(), FUND + 1e6);
        assertEq(pool.lockedIncome(), 5e6);
    }

    /// @notice The fund is not investors' money: it neither raises the share price nor can be lent or withdrawn.
    function test_WelcomeFund_IsKeptApartFromInvestorsMoney() public {
        uint256 assetsBefore = pool.totalAssets();
        uint256 cashBefore = pool.availableCash();
        _fundWelcome(10_000e6);

        assertEq(pool.welcomeFund(), FUND + 10_000e6);
        assertEq(pool.totalAssets(), assetsBefore, "the share price does not move");
        assertEq(pool.availableCash(), cashBefore, "nor can it be lent or withdrawn");
        assertEq(pool.cash(), cashBefore);
    }

    function test_WithdrawWelcome() public {
        pool.withdrawWelcome(stranger, 200e6);
        assertEq(pool.welcomeFund(), FUND - 200e6);
        assertEq(usdc.balanceOf(stranger), 200e6);

        vm.expectRevert(LendingPool.LendingPool__InsufficientWelcomeFund.selector);
        pool.withdrawWelcome(stranger, FUND);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, pool.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(stranger);
        pool.withdrawWelcome(stranger, 1e6);
    }

    function test_FundWelcome_Revert_Zero() public {
        vm.expectRevert(LendingPool.LendingPool__ZeroAmount.selector);
        pool.fundWelcome(0);
    }

    function test_SetWelcomeShare() public {
        market.setWelcomeShare(0);
        assertEq(market.welcomeShareBps(), 0);

        // With investors on 50%, the welcome fund can take at most the other 50%.
        market.setWelcomeShare(5_000);
        vm.expectRevert(Marketplace.Marketplace__InvalidParameters.selector);
        market.setWelcomeShare(5_001);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, market.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(stranger);
        market.setWelcomeShare(1_000);
    }

    /*//////////////////////////////////////////////////////////////
                         THE $25 MINIMUM
    //////////////////////////////////////////////////////////////*/

    /// @notice ₦37,500 at the demo rate, enough for a small bill.
    function test_SmallestAdvanceIsTwentyFiveDollars() public {
        assertEq(pool.MIN_BORROW_AMOUNT(), 25e6);
        uint256 loanId = _borrow(farmer, lotId, 500e18, 25e6, 30);
        assertEq(pool.getLoan(loanId).principal, 25e6);
        // A partial liquidation still never leaves less than $100 open.
        assertEq(pool.MIN_REMAINING_DEBT(), 100e6);
    }

    /*//////////////////////////////////////////////////////////////
                                FUZZ
    //////////////////////////////////////////////////////////////*/

    /// @notice For any first advance: a month at the starting rate, capped, and never more than the fund.
    function testFuzz_FirstAdvance_AMonthCappedAndFunded(uint256 _amount, uint256 _fund) public {
        uint256 cocoaLot = _verifiedLot(farmer, COCOA, 10_000e18, CommodityRegistry.Grade.A);
        _amount = bound(_amount, 25e6, 20_000e6);
        pool.withdrawWelcome(address(this), FUND);
        _fund = bound(_fund, 0, 100e6);
        if (_fund > 0) _fundWelcome(_fund);

        uint256 loanId = _borrow(farmer, cocoaLot, 10_000e18, _amount, 90);
        uint256 credit = pool.welcomeCredit(loanId);

        // The rate the advance starts at: 5% plus a tenth of the share of the pool it puts out on loan.
        uint256 rate = 5e16 + (((_amount * 1e18) / POOL_LIQUIDITY) * 10e16) / 1e18;
        uint256 expected = _month(_amount, rate);
        if (expected > 50e6) expected = 50e6;
        if (expected > _fund) expected = _fund;
        assertEq(credit, expected);
        assertEq(pool.welcomeFund(), _fund - credit);
        assertApproxEqAbs(pool.debtOf(loanId), _amount - credit, 1);
        assertEq(pool.welcomeUsed(farmer), credit > 0);
    }
}
