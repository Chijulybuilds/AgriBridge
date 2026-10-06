// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {CommodityPriceOracle} from "src/CommodityPriceOracle.sol";
import {Marketplace} from "src/Marketplace.sol";
import {ProtocolFixture} from "test/utils/ProtocolFixture.sol";

/**
 * @title MarketplaceTest
 * @notice Listing, buying (fixed and reference-priced), cancelling, and the clearance of expired stock.
 * @dev Cocoa's reference value is its world price less the 15% basis cut, times its decay:
 *      $6.50 x 85% = $5.525 per kg at intake.
 */
contract MarketplaceTest is ProtocolFixture {
    Marketplace internal market;

    address internal buyer = makeAddr("buyer");
    address internal regulator = makeAddr("regulator");

    uint96 internal constant KG = 1_000e18;
    uint256 internal lotId;

    function setUp() public {
        _deployFixture();
        market = d.marketplace;
        d.registry.grantRole(d.registry.REGULATOR_ROLE(), regulator);

        lotId = _verifiedLot(farmer, COCOA, KG, CommodityRegistry.Grade.A);
        vm.prank(farmer);
        d.commodityToken.setApprovalForAll(address(market), true);

        usdc.mint(buyer, 100_000e6);
        vm.prank(buyer);
        usdc.approve(address(market), type(uint256).max);
    }

    function _list(uint256 _kg, Marketplace.PriceMode _mode, uint256 _price) internal returns (uint256) {
        vm.prank(farmer);
        return market.list(lotId, _kg, _mode, _price);
    }

    function _buy(uint256 _listingId, uint256 _kg) internal returns (uint256) {
        vm.prank(buyer);
        return market.buy(_listingId, _kg, type(uint256).max);
    }

    /*//////////////////////////////////////////////////////////////
                                LISTING
    //////////////////////////////////////////////////////////////*/

    function test_List_HoldsTheTokens() public {
        uint256 listingId = _list(600e18, Marketplace.PriceMode.Fixed, 5e6);

        Marketplace.Listing memory listing = market.getListing(listingId);
        assertEq(listing.seller, farmer);
        assertEq(listing.lotId, lotId);
        assertEq(listing.kgRemaining, 600e18);
        assertTrue(listing.active);
        assertEq(d.commodityToken.balanceOf(address(market), lotId), 600e18);
        assertEq(d.commodityToken.balanceOf(farmer, lotId), 400e18);
    }

    function test_List_Revert_BadInput() public {
        vm.startPrank(farmer);
        vm.expectRevert(Marketplace.Marketplace__InvalidAmount.selector);
        market.list(lotId, 0, Marketplace.PriceMode.Fixed, 5e6);

        vm.expectRevert(Marketplace.Marketplace__InvalidPrice.selector);
        market.list(lotId, 1e18, Marketplace.PriceMode.Fixed, 0);

        vm.expectRevert(Marketplace.Marketplace__InvalidPrice.selector);
        market.list(lotId, 1e18, Marketplace.PriceMode.Reference, 20_001);
        vm.stopPrank();
    }

    function test_List_Revert_FrozenOrExpiredLot() public {
        vm.prank(regulator);
        d.registry.setLotFrozen(lotId, true);
        vm.expectRevert(Marketplace.Marketplace__LotNotTradable.selector);
        _list(1e18, Marketplace.PriceMode.Fixed, 5e6);

        vm.prank(regulator);
        d.registry.setLotFrozen(lotId, false);
        vm.warp(d.registry.expiresAt(lotId));
        vm.expectRevert(Marketplace.Marketplace__LotNotTradable.selector);
        _list(1e18, Marketplace.PriceMode.Fixed, 5e6);
    }

    /*//////////////////////////////////////////////////////////////
                                 BUYING
    //////////////////////////////////////////////////////////////*/

    /// @notice 200 kg at $5/kg is $1,000: the seller receives $990, the treasury the 1% fee.
    function test_Buy_PartOfAListing() public {
        uint256 listingId = _list(600e18, Marketplace.PriceMode.Fixed, 5e6);
        uint256 treasuryBefore = usdc.balanceOf(address(this));

        uint256 cost = _buy(listingId, 200e18);

        assertEq(cost, 1_000e6);
        assertEq(usdc.balanceOf(farmer), 990e6);
        assertEq(usdc.balanceOf(address(this)) - treasuryBefore, 10e6);
        assertEq(d.commodityToken.balanceOf(buyer, lotId), 200e18);
        assertEq(market.getListing(listingId).kgRemaining, 400e18);
    }

    function test_Buy_TheLastKilogramClosesTheListing() public {
        uint256 listingId = _list(100e18, Marketplace.PriceMode.Fixed, 5e6);
        _buy(listingId, 100e18);

        assertFalse(market.getListing(listingId).active);
        vm.expectRevert(Marketplace.Marketplace__ListingNotActive.selector);
        _buy(listingId, 1e18);
    }

    /// @notice A reference-priced listing follows the oracle and the lot's decay.
    function test_Buy_ReferencePriceFollowsTheMarketAndDecay() public {
        uint256 listingId = _list(500e18, Marketplace.PriceMode.Reference, 10_000); // 100% of reference
        assertEq(market.referencePricePerKg(lotId), 5_525_000); // $5.525
        assertEq(_buy(listingId, 100e18), 552_500_000);

        // 90 days on: 87.5% decay times 85% is 74.37%, so $4.834 a kilogram.
        vm.warp(block.timestamp + 90 days);
        d.oracle.setPrice(COCOA, 650e6);
        assertEq(market.pricePerKg(listingId), 4_834_050);
    }

    function test_Buy_Revert_AbovePriceLimit() public {
        uint256 listingId = _list(500e18, Marketplace.PriceMode.Fixed, 5e6);
        vm.expectRevert(Marketplace.Marketplace__PriceAboveLimit.selector);
        vm.prank(buyer);
        market.buy(listingId, 100e18, 499e6);
    }

    function test_Buy_Revert_LotFrozenAfterListing() public {
        uint256 listingId = _list(500e18, Marketplace.PriceMode.Fixed, 5e6);
        vm.prank(regulator);
        d.registry.setLotFrozen(lotId, true);

        vm.expectRevert(Marketplace.Marketplace__LotNotTradable.selector);
        _buy(listingId, 100e18);
    }

    function test_Buy_Revert_StaleReferencePrice() public {
        uint256 listingId = _list(500e18, Marketplace.PriceMode.Reference, 10_000);
        vm.warp(block.timestamp + HEARTBEAT + 1);

        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceStale.selector);
        _buy(listingId, 100e18);
    }

    /*//////////////////////////////////////////////////////////////
                           CANCEL AND REPRICE
    //////////////////////////////////////////////////////////////*/

    function test_Cancel_ReturnsTheUnsoldTokens() public {
        uint256 listingId = _list(600e18, Marketplace.PriceMode.Fixed, 5e6);
        _buy(listingId, 100e18);

        vm.prank(farmer);
        market.cancel(listingId);
        assertEq(d.commodityToken.balanceOf(farmer, lotId), 900e18);
        assertFalse(market.getListing(listingId).active);
    }

    /// @notice Freezing a listed lot does not trap the seller's tokens.
    function test_Cancel_ReturnsAFrozenLot() public {
        uint256 listingId = _list(600e18, Marketplace.PriceMode.Fixed, 5e6);
        vm.prank(regulator);
        d.registry.setLotFrozen(lotId, true);

        vm.prank(farmer);
        market.cancel(listingId);
        assertEq(d.commodityToken.balanceOf(farmer, lotId), KG);
    }

    function test_CancelAndReprice_Revert_NotSeller() public {
        uint256 listingId = _list(600e18, Marketplace.PriceMode.Fixed, 5e6);
        vm.startPrank(buyer);
        vm.expectRevert(Marketplace.Marketplace__NotSeller.selector);
        market.cancel(listingId);

        vm.expectRevert(Marketplace.Marketplace__NotSeller.selector);
        market.reprice(listingId, Marketplace.PriceMode.Fixed, 1e6);
        vm.stopPrank();
    }

    function test_Reprice() public {
        uint256 listingId = _list(600e18, Marketplace.PriceMode.Fixed, 5e6);
        vm.prank(farmer);
        market.reprice(listingId, Marketplace.PriceMode.Reference, 9_800); // 98% of reference

        assertEq(market.pricePerKg(listingId), (5_525_000 * 9_800) / 10_000);
    }

    /*//////////////////////////////////////////////////////////////
                               CLEARANCE
    //////////////////////////////////////////////////////////////*/

    function _expireAndFund() internal {
        vm.warp(d.registry.expiresAt(lotId));
        d.oracle.setPrice(COCOA, 650e6); // a fresh world price
        usdc.mint(address(this), 10_000e6);
        usdc.approve(address(market), 10_000e6);
        market.fundClearance(10_000e6);
    }

    /// @notice Expired cocoa (Grade C: 40%, less the basis cut: $2.21/kg) is bought 30% below that.
    function test_SellExpired_PaysBelowTheReference() public {
        _expireAndFund();
        assertEq(market.referencePricePerKg(lotId), 2_210_000);

        vm.prank(farmer);
        uint256 paid = market.sellExpired(lotId, KG);

        assertEq(paid, 1_547e6, "1,000 kg x $2.21 x 70%");
        assertEq(usdc.balanceOf(farmer), 1_547e6);
        assertEq(market.clearanceInventory(lotId), KG);
        assertEq(market.clearanceFund(), 10_000e6 - 1_547e6);
    }

    function test_SellExpired_Revert_NotExpiredOrNoFund() public {
        vm.expectRevert(Marketplace.Marketplace__LotNotExpired.selector);
        vm.prank(farmer);
        market.sellExpired(lotId, KG);

        vm.warp(d.registry.expiresAt(lotId));
        d.oracle.setPrice(COCOA, 650e6);
        vm.expectRevert(Marketplace.Marketplace__InsufficientClearanceFund.selector);
        vm.prank(farmer);
        market.sellExpired(lotId, KG);
    }

    /// @notice Cleared stock is listed for feed buyers; the proceeds go to the treasury, fee-free.
    function test_ListClearance_AndSellToAFeedBuyer() public {
        _expireAndFund();
        vm.prank(farmer);
        market.sellExpired(lotId, KG);

        uint256 listingId = market.listClearance(lotId, KG, 1_800_000); // $1.80/kg
        uint256 treasuryBefore = usdc.balanceOf(address(this));

        assertEq(_buy(listingId, 500e18), 900e6);
        assertEq(usdc.balanceOf(address(this)) - treasuryBefore, 900e6);
        assertEq(d.commodityToken.balanceOf(buyer, lotId), 500e18);
    }

    function test_CancelClearance_RestoresInventory() public {
        _expireAndFund();
        vm.prank(farmer);
        market.sellExpired(lotId, KG);
        uint256 listingId = market.listClearance(lotId, 400e18, 1_800_000);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, farmer, market.CLEARANCE_ROLE()
            )
        );
        vm.prank(farmer);
        market.cancel(listingId);

        market.cancel(listingId);
        assertEq(market.clearanceInventory(lotId), KG);
    }

    function test_ListClearance_Revert_NotEnoughInventory() public {
        vm.expectRevert(Marketplace.Marketplace__InsufficientInventory.selector);
        market.listClearance(lotId, 1e18, 1e6);
    }

    /*//////////////////////////////////////////////////////////////
                                 ADMIN
    //////////////////////////////////////////////////////////////*/

    function test_SetFees_Bounds() public {
        vm.expectRevert(Marketplace.Marketplace__InvalidParameters.selector);
        market.setFees(501, address(this), 3_000);

        market.setFees(250, buyer, 4_000);
        assertEq(market.feeBps(), 250);
        assertEq(market.feeRecipient(), buyer);
        assertEq(market.clearanceDiscountBps(), 4_000);
    }
}
