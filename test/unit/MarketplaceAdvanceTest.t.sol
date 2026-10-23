// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {LendingPool} from "src/LendingPool.sol";
import {Marketplace} from "src/Marketplace.sol";
import {ProtocolFixture} from "test/utils/ProtocolFixture.sol";

/**
 * @title MarketplaceAdvanceTest
 * @notice Get paid today, sell at your price: listing a crop with an advance from the lending pool,
 *         each sale repaying its share of the advance, and investors' share of the marketplace fee.
 * @dev The worked example: Amina has 2,000 kg of Grade A cashew, worth $6,400 at $3.20 a kilogram.
 *      She lists it at $3.30 and takes $3,000 today, due in 60 days if it has not sold by then. Cashew
 *      is priced locally (no basis cut) and reaches Grade B at 270 days, so on the 60-day end date it
 *      will be worth $6,044 and her limit is half of that: $3,022.
 */
contract MarketplaceAdvanceTest is ProtocolFixture {
    LendingPool internal pool;
    Marketplace internal market;

    address internal buyer = makeAddr("buyer");
    address internal liquidator = makeAddr("liquidator");
    address internal regulator = makeAddr("regulator");
    address internal stranger = makeAddr("stranger");
    address internal whale = makeAddr("whale");

    uint96 internal constant CROP = 2_000e18;
    uint256 internal constant PRICE = 3_300_000; // $3.30 a kilogram
    uint256 internal constant ADVANCE = 3_000e6;
    uint256 internal constant TERM = 60 days;
    uint256 internal constant POOL_LIQUIDITY = 100_000e6;

    uint256 internal lotId;

    function setUp() public {
        _deployFixture();
        pool = d.pool;
        market = d.marketplace;
        d.registry.grantRole(d.registry.REGULATOR_ROLE(), regulator);
        // The tests run for weeks of chain time, so cashew's price must stay fresh that long.
        d.oracle.setHeartbeat(CASHEW, 365 days);
        _seedPool(POOL_LIQUIDITY);

        lotId = _verifiedLot(farmer, CASHEW, CROP, CommodityRegistry.Grade.A);
        vm.startPrank(farmer);
        d.commodityToken.setApprovalForAll(address(market), true);
        d.commodityToken.setApprovalForAll(address(pool), true);
        usdc.approve(address(pool), type(uint256).max);
        vm.stopPrank();

        _fund(buyer, address(market));
        _fund(liquidator, address(pool));
    }

    function _fund(address _who, address _spender) internal {
        usdc.mint(_who, 2_000_000e6);
        vm.prank(_who);
        usdc.approve(_spender, type(uint256).max);
    }

    function _listWithAdvance(uint256 _price, uint256 _advance) internal returns (uint256 listingId, uint256 loanId) {
        vm.prank(farmer);
        return market.listWithAdvance(
            lotId, CROP, Marketplace.PriceMode.Fixed, _price, 0, 0, _advance, uint64(block.timestamp + TERM)
        );
    }

    function _buy(uint256 _listingId, uint256 _kg) internal returns (uint256) {
        vm.prank(buyer);
        return market.buy(_listingId, _kg, type(uint256).max);
    }

    /*//////////////////////////////////////////////////////////////
                      LISTING WITH AN ADVANCE
    //////////////////////////////////////////////////////////////*/

    function test_ListWithAdvance_PaysTheSellerTodayAndPledgesTheCrop() public {
        (uint256 listingId, uint256 loanId) = _listWithAdvance(PRICE, ADVANCE);

        assertEq(usdc.balanceOf(farmer), ADVANCE, "paid today");
        assertEq(d.commodityToken.balanceOf(address(pool), lotId), CROP, "the crop is the advance's collateral");
        assertEq(d.commodityToken.balanceOf(address(market), lotId), 0, "nothing sits in the marketplace");

        LendingPool.Loan memory loan = pool.getLoan(loanId);
        assertEq(loan.borrower, farmer, "the advance is in the farmer's name");
        assertEq(loan.collateralKg, CROP);
        assertEq(loan.principal, ADVANCE);
        assertEq(pool.getBorrowerLoans(farmer)[0], loanId);

        Marketplace.Listing memory listing = market.getListing(listingId);
        assertEq(listing.loanId, loanId);
        assertEq(listing.kgRemaining, CROP);
        assertEq(listing.price, PRICE);
        assertEq(market.listingOfLoan(loanId), listingId);
        assertEq(market.availableKg(listingId), CROP);
    }

    /// @notice $3,000 needs at least $3,300 of asking price for 2,000 kg: $1.65 a kilogram.
    function test_ListWithAdvance_Revert_PriceTooLowForTheAdvance() public {
        vm.expectRevert(abi.encodeWithSelector(Marketplace.Marketplace__PriceBelowAdvance.selector, 1_650_000));
        _listWithAdvance(1_600_000, ADVANCE);

        // Half of today's fair value is $1.60 a kilogram too: also too low.
        vm.expectRevert(abi.encodeWithSelector(Marketplace.Marketplace__PriceBelowAdvance.selector, 1_650_000));
        vm.prank(farmer);
        market.listWithAdvance(
            lotId, CROP, Marketplace.PriceMode.Reference, 5_000, 0, 0, ADVANCE, uint64(block.timestamp + TERM)
        );

        // The floor counts a bulk deal: $1.80 less 10% is $1.62 a kilogram.
        vm.expectRevert(abi.encodeWithSelector(Marketplace.Marketplace__PriceBelowAdvance.selector, 1_833_334));
        vm.prank(farmer);
        market.listWithAdvance(
            lotId, CROP, Marketplace.PriceMode.Fixed, 1_800_000, 500e18, 1_000, ADVANCE, uint64(block.timestamp + TERM)
        );
    }

    function test_ListWithAdvance_Revert_AboveTheLimitOrTheMinimum() public {
        vm.expectRevert(LendingPool.LendingPool__ExceedsMaxLTV.selector);
        _listWithAdvance(PRICE, 3_100e6);

        vm.expectRevert(LendingPool.LendingPool__InvalidLoanBounds.selector);
        _listWithAdvance(PRICE, 25e6 - 1);
    }

    function test_ListWithAdvance_Revert_WhileThePoolIsPaused() public {
        pool.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        _listWithAdvance(PRICE, ADVANCE);
    }

    function test_Reprice_Revert_BelowTheAdvance() public {
        (uint256 listingId,) = _listWithAdvance(PRICE, ADVANCE);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.Marketplace__PriceBelowAdvance.selector, 1_650_000));
        vm.prank(farmer);
        market.reprice(listingId, Marketplace.PriceMode.Fixed, 1_500_000, 0, 0);

        vm.prank(farmer);
        market.reprice(listingId, Marketplace.PriceMode.Fixed, 3_500_000, 0, 0);
        assertEq(market.pricePerKg(listingId), 3_500_000);
    }

    /*//////////////////////////////////////////////////////////////
                                SELLING
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice A month on, a buyer takes 500 kg, a quarter of the crop, for $1,650 plus the $16.50 fee.
     *         A quarter of the debt is repaid out of the $1,650 and Amina receives the rest at once. Of
     *         the fee, $8.25 goes to investors, $1.65 to the welcome fund and $6.60 to the treasury.
     */
    function test_Buy_RepaysTheAdvancesShareAndPaysTheSellerTheRest() public {
        (uint256 listingId, uint256 loanId) = _listWithAdvance(PRICE, ADVANCE);
        vm.warp(block.timestamp + 30 days);

        uint256 debtBefore = pool.debtOf(loanId);
        uint256 healthBefore = pool.getHealthFactor(loanId);
        uint256 share = pool.saleShare(loanId, 500e18);
        assertEq(share, (debtBefore + 3) / 4, "a quarter of the debt, rounded up");
        assertGt(debtBefore, ADVANCE, "a month of interest");

        uint256 farmerBefore = usdc.balanceOf(farmer);
        uint256 treasuryBefore = usdc.balanceOf(address(this));
        uint256 paid = _buy(listingId, 500e18);

        assertEq(paid, 1_666_500_000, "$1,650 plus the 1% fee");
        assertEq(usdc.balanceOf(farmer) - farmerBefore, 1_650e6 - share, "the price less the advance's share");
        assertEq(d.commodityToken.balanceOf(buyer, lotId), 500e18);
        assertEq(pool.getLoan(loanId).collateralKg, 1_500e18);
        assertApproxEqAbs(pool.debtOf(loanId), debtBefore - share, 1);
        // As healthy as before, to the micro-dollar the pool rounds in its own favour.
        assertApproxEqRel(pool.getHealthFactor(loanId), healthBefore, 1e10, "the advance is as healthy");

        assertEq(pool.lockedIncome(), 8_250_000, "half the $16.50 fee to investors");
        assertEq(pool.welcomeFund(), 1_650_000, "a tenth to the welcome fund for new farmers");
        assertEq(usdc.balanceOf(address(this)) - treasuryBefore, 6_600_000, "the other 40% to the treasury");
        assertEq(market.availableKg(listingId), 1_500e18);
    }

    /// @notice Selling the last kilogram repays the advance in full, and it counts as on time.
    function test_Buy_TheWholeCropRepaysTheAdvanceAndBuildsTheRecord() public {
        (uint256 listingId, uint256 loanId) = _listWithAdvance(PRICE, ADVANCE);
        vm.warp(block.timestamp + 15 days);

        uint256 debt = pool.debtOf(loanId);
        _buy(listingId, CROP);

        assertEq(usdc.balanceOf(farmer), ADVANCE + 6_600e6 - debt, "the advance, then the rest of $6,600");
        assertEq(uint8(pool.getLoan(loanId).status), uint8(LendingPool.LoanStatus.REPAID));
        assertEq(pool.debtOf(loanId), 0);
        assertEq(d.commodityToken.balanceOf(buyer, lotId), CROP);
        assertEq(d.commodityToken.balanceOf(address(pool), lotId), 0);
        assertFalse(market.getListing(listingId).active);
        assertEq(market.listingOfLoan(loanId), 0);

        (uint256 onTime, uint256 late, uint256 settled,) = pool.creditOf(farmer);
        assertEq(onTime, 1, "repaid by the sale, on time");
        assertEq(late + settled, 0);
    }

    function test_Buy_RepaysEvenWhileThePoolIsPaused() public {
        (uint256 listingId, uint256 loanId) = _listWithAdvance(PRICE, ADVANCE);
        pool.pause();
        _buy(listingId, CROP);
        assertEq(uint8(pool.getLoan(loanId).status), uint8(LendingPool.LoanStatus.REPAID));
    }

    function test_Buy_Revert_LotFrozen() public {
        (uint256 listingId,) = _listWithAdvance(PRICE, ADVANCE);
        vm.prank(regulator);
        d.registry.setLotFrozen(lotId, true);

        vm.expectRevert(Marketplace.Marketplace__LotNotTradable.selector);
        _buy(listingId, 100e18);
    }

    /*//////////////////////////////////////////////////////////////
                 THE CROP BEHIND AN EXISTING ADVANCE
    //////////////////////////////////////////////////////////////*/

    /// @notice An advance taken at the warehouse gate, listed later: each sale repays its share.
    function test_ListCollateral_SellsTheCropOfAnAdvanceTakenAtTheGate() public {
        uint256 loanId = _borrow(farmer, lotId, CROP, ADVANCE, 60);

        vm.prank(farmer);
        uint256 listingId = market.listCollateral(loanId, Marketplace.PriceMode.Fixed, PRICE, 0, 0);
        assertEq(market.getListing(listingId).kgRemaining, CROP, "the whole pledged crop");
        assertEq(market.getListing(listingId).loanId, loanId);

        uint256 share = pool.saleShare(loanId, 1_000e18);
        _buy(listingId, 1_000e18);
        assertEq(usdc.balanceOf(farmer), ADVANCE + 3_300e6 - share);
        assertEq(pool.getLoan(loanId).collateralKg, 1_000e18);
    }

    function test_ListCollateral_Revert_NotTheBorrowerOrListedTwice() public {
        uint256 loanId = _borrow(farmer, lotId, CROP, ADVANCE, 60);

        vm.expectRevert(Marketplace.Marketplace__NotSeller.selector);
        vm.prank(stranger);
        market.listCollateral(loanId, Marketplace.PriceMode.Fixed, PRICE, 0, 0);

        vm.startPrank(farmer);
        market.listCollateral(loanId, Marketplace.PriceMode.Fixed, PRICE, 0, 0);
        vm.expectRevert(Marketplace.Marketplace__LoanAlreadyListed.selector);
        market.listCollateral(loanId, Marketplace.PriceMode.Fixed, PRICE, 0, 0);
        vm.stopPrank();
    }

    function test_ListCollateral_Revert_ClosedAdvance() public {
        uint256 loanId = _borrow(farmer, lotId, CROP, ADVANCE, 60);
        vm.prank(farmer);
        pool.repay(loanId, type(uint256).max);

        vm.expectRevert(Marketplace.Marketplace__ListingNotActive.selector);
        vm.prank(farmer);
        market.listCollateral(loanId, Marketplace.PriceMode.Fixed, PRICE, 0, 0);
    }

    /*//////////////////////////////////////////////////////////////
                    CANCELLING, REPAYING, SETTLEMENT
    //////////////////////////////////////////////////////////////*/

    /// @notice Taking the listing down leaves the advance as it was; the crop can be listed again.
    function test_Cancel_KeepsTheCropPledged() public {
        (uint256 listingId, uint256 loanId) = _listWithAdvance(PRICE, ADVANCE);

        vm.prank(farmer);
        market.cancel(listingId);

        assertFalse(market.getListing(listingId).active);
        assertEq(market.listingOfLoan(loanId), 0);
        assertEq(d.commodityToken.balanceOf(address(pool), lotId), CROP, "still the advance's collateral");
        assertEq(uint8(pool.getLoan(loanId).status), uint8(LendingPool.LoanStatus.ACTIVE));

        vm.prank(farmer);
        uint256 again = market.listCollateral(loanId, Marketplace.PriceMode.Fixed, 3_400_000, 0, 0);
        assertEq(market.listingOfLoan(loanId), again);
    }

    /// @notice Repaying the advance directly returns the crop, and the listing can no longer sell.
    function test_RepayDirectly_ClosesTheSale() public {
        (uint256 listingId, uint256 loanId) = _listWithAdvance(PRICE, ADVANCE);
        usdc.mint(farmer, 100e6); // covers the interest

        vm.prank(farmer);
        pool.repay(loanId, type(uint256).max);
        assertEq(d.commodityToken.balanceOf(farmer, lotId), CROP, "the crop comes back");
        assertEq(market.availableKg(listingId), 0);

        vm.expectRevert(LendingPool.LendingPool__LoanNotActive.selector);
        _buy(listingId, 100e18);

        vm.prank(farmer);
        market.cancel(listingId);
        assertFalse(market.getListing(listingId).active);
    }

    /**
     * @notice The price falls to $1.80 and the advance is settled in part: buyers can then take only
     *         the crop still pledged, and each kilogram still repays its share.
     */
    function test_PartialSettlement_LimitsWhatBuyersCanTake() public {
        (uint256 listingId, uint256 loanId) = _listWithAdvance(PRICE, ADVANCE);
        _movePrice(CASHEW, 180e6);

        vm.prank(liquidator);
        pool.liquidate(loanId, type(uint256).max);
        uint256 left = pool.getLoan(loanId).collateralKg;
        assertLt(left, CROP, "part of the crop was taken");
        assertEq(market.availableKg(listingId), left);

        vm.expectRevert(LendingPool.LendingPool__InsufficientCollateralBalance.selector);
        _buy(listingId, left + 1);

        uint256 share = pool.saleShare(loanId, left);
        assertEq(share, pool.debtOf(loanId), "the rest of the crop owes the rest of the debt");
        _buy(listingId, left);
        assertEq(uint8(pool.getLoan(loanId).status), uint8(LendingPool.LoanStatus.REPAID));
    }

    /*//////////////////////////////////////////////////////////////
                           INVESTORS' FEE SHARE
    //////////////////////////////////////////////////////////////*/

    function _ordinarySale(uint256 _pricePerKg, uint256 _kg) internal {
        vm.prank(farmer);
        uint256 listingId = market.list(lotId, _kg, Marketplace.PriceMode.Fixed, _pricePerKg, 0, 0);
        _buy(listingId, _kg);
    }

    /// @notice A $1,000 sale pays investors $5, counted into the share price evenly over 7 days.
    function test_FeeIncome_CountsOverSevenDays() public {
        assertEq(pool.totalAssets(), POOL_LIQUIDITY);
        _ordinarySale(1e6, 1_000e18);

        assertEq(pool.lockedIncome(), 5e6);
        assertEq(pool.totalAssets(), POOL_LIQUIDITY, "nothing counts at once");
        assertEq(pool.availableCash(), POOL_LIQUIDITY, "nor can it be lent or withdrawn yet");

        vm.warp(block.timestamp + 3.5 days);
        assertEq(pool.totalAssets(), POOL_LIQUIDITY + 2.5e6, "half way");

        vm.warp(block.timestamp + 3.5 days);
        assertEq(pool.totalAssets(), POOL_LIQUIDITY + 5e6, "all of it after a week");
        assertEq(pool.availableCash(), POOL_LIQUIDITY + 5e6);
    }

    /**
     * @notice A whale deposits $1M just before a $1M sale pays investors $5,000, and leaves twelve
     *         seconds later. Without the 7-day release it would take about $4,500; it takes cents.
     */
    function test_FeeIncome_ADepositJustBeforeAPaymentEarnsAlmostNothing() public {
        usdc.mint(whale, 1_000_000e6);
        vm.startPrank(whale);
        usdc.approve(address(pool), type(uint256).max);
        pool.deposit(1_000_000e6);
        vm.stopPrank();

        _ordinarySale(500e6, CROP); // 2,000 kg at $500: a $1M sale, a $10,000 fee
        assertEq(pool.lockedIncome(), 5_000e6);

        vm.roll(block.number + 1);
        vm.warp(block.timestamp + 12);
        uint256 shares = d.shareToken.balanceOf(whale);
        vm.prank(whale);
        pool.withdraw(shares);

        assertLt(usdc.balanceOf(whale), 1_000_000e6 + 1e6, "less than a dollar gained");
    }

    function test_AddIncome_AnyoneCanAdd() public {
        usdc.mint(stranger, 1_000e6);
        vm.startPrank(stranger);
        usdc.approve(address(pool), 1_000e6);
        pool.addIncome(1_000e6);
        vm.stopPrank();
        assertEq(pool.lockedIncome(), 1_000e6);

        vm.expectRevert(LendingPool.LendingPool__ZeroAmount.selector);
        pool.addIncome(0);
    }

    function test_SetInvestorShare() public {
        market.setInvestorShare(0);
        uint256 treasuryBefore = usdc.balanceOf(address(this));
        _ordinarySale(1e6, 1_000e18);
        assertEq(pool.lockedIncome(), 0);
        assertEq(pool.welcomeFund(), 1e6, "the welcome fund keeps its tenth of the $10 fee");
        assertEq(usdc.balanceOf(address(this)) - treasuryBefore, 9e6, "the investors' half goes to the treasury");

        // With the welcome fund's 10%, investors can have at most 90%.
        market.setInvestorShare(9_000);
        vm.expectRevert(Marketplace.Marketplace__InvalidParameters.selector);
        market.setInvestorShare(9_001);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, market.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(stranger);
        market.setInvestorShare(5_000);
    }

    function test_QuoteWithFee() public {
        (uint256 listingId,) = _listWithAdvance(PRICE, ADVANCE);
        (uint256 cost, uint256 fee) = market.quoteWithFee(listingId, 100e18);
        assertEq(cost, 330e6);
        assertEq(fee, 3_300_000);
    }

    /*//////////////////////////////////////////////////////////////
                            ACCESS CONTROL
    //////////////////////////////////////////////////////////////*/

    function test_PoolSales_OnlyTheMarketplace() public {
        bytes32 role = pool.MARKETPLACE_ROLE();
        vm.startPrank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        pool.borrowFor(stranger, lotId, CROP, ADVANCE, uint64(block.timestamp + TERM));

        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role)
        );
        pool.sellCollateral(1, 1e18, stranger, 1e6);
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                                 FUZZ
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Whatever is sold and whenever, the seller and the pool share exactly the price, and the
     *         debt left is the same share of the crop left as before, to the micro-dollar the pool
     *         rounds in its own favour: the advance is exactly as healthy.
     */
    function testFuzz_ASaleSharesThePriceAndKeepsTheAdvanceAsHealthy(uint256 _kg, uint256 _days) public {
        _kg = bound(_kg, 1, CROP / 1e18) * 1e18; // whole kilograms, as the app sells them
        _days = bound(_days, 0, 59);
        (uint256 listingId, uint256 loanId) = _listWithAdvance(PRICE, ADVANCE);
        vm.warp(block.timestamp + _days * 1 days);

        uint256 cost = market.quote(listingId, _kg);
        uint256 share = pool.saleShare(loanId, _kg);
        uint256 debtBefore = pool.debtOf(loanId);
        uint256 farmerBefore = usdc.balanceOf(farmer);
        _buy(listingId, _kg);

        assertEq(usdc.balanceOf(farmer) - farmerBefore, cost - share, "the seller gets the price less the share");
        if (_kg < CROP) {
            uint256 proportional = (debtBefore * (CROP - _kg)) / CROP;
            assertApproxEqAbs(pool.debtOf(loanId), proportional, 2, "the same share of the crop left");
        } else {
            assertEq(uint8(pool.getLoan(loanId).status), uint8(LendingPool.LoanStatus.REPAID));
        }
    }
}
