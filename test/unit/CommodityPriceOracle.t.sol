// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/CommodityPriceOracle.sol";

/**
 * @title CommodityPriceOracleTest
 * @author AgriDeFi Protocol Team
 * @notice Unit tests for CommodityPriceOracle contract
 */
contract CommodityPriceOracleTest is Test {
    /*//////////////////////////////////////////////////////////////
                            STATE
    //////////////////////////////////////////////////////////////*/

    CommodityPriceOracle public oracle;
    address public owner;
    address public updater = address(0x1111);

    /*//////////////////////////////////////////////////////////////
                            SETUP
    //////////////////////////////////////////////////////////////*/

    function setUp() public {
        owner = address(this);
        oracle = new CommodityPriceOracle();
    }

    /*//////////////////////////////////////////////////////////////
                        PRICE UPDATE TESTS
    //////////////////////////////////////////////////////////////*/

    function testSetPrice() public {
        oracle.setPrice("Cocoa", 65000); // $650 in cents

        (uint256 price, uint256 timestamp) = oracle.getPrice("Cocoa");
        assertEq(price, 65000);
        assertEq(timestamp, block.timestamp);
    }

    function testUpdatePrice() public {
        oracle.setPrice("Cocoa", 65000);
        vm.warp(block.timestamp + 1 hours);

        oracle.setPrice("Cocoa", 66000); // Update price

        (uint256 price, uint256 timestamp) = oracle.getPrice("Cocoa");
        assertEq(price, 66000);
        assertEq(timestamp, block.timestamp);
    }

    function testSetInvalidPrice() public {
        vm.expectRevert(CommodityPriceOracle.InvalidPrice.selector);
        oracle.setPrice("Cocoa", 0); // Invalid: 0 price
    }

    function testSetPriceTooHigh() public {
        vm.expectRevert(CommodityPriceOracle.InvalidPrice.selector);
        oracle.setPrice("Cocoa", 101_000_000_00); // Above max
    }

    /*//////////////////////////////////////////////////////////////
                        STALENESS TESTS
    //////////////////////////////////////////////////////////////*/

    function testIsFreshPrice() public {
        oracle.setPrice("Cocoa", 65000);
        assertEq(oracle.isFresh("Cocoa"), true);

        // Fast forward 23 hours
        vm.warp(block.timestamp + 23 hours);
        assertEq(oracle.isFresh("Cocoa"), true);

        // Fast forward to 24+ hours
        vm.warp(block.timestamp + 2 hours);
        assertEq(oracle.isFresh("Cocoa"), false);
    }

    function testGetPriceFresh() public {
        oracle.setPrice("Cocoa", 65000);

        uint256 price = oracle.getPriceFresh("Cocoa");
        assertEq(price, 65000);

        // Fast forward 25 hours
        vm.warp(block.timestamp + 25 hours);

        vm.expectRevert(CommodityPriceOracle.PriceStale.selector);
        oracle.getPriceFresh("Cocoa");
    }

    /*//////////////////////////////////////////////////////////////
                        COMMODITY AVAILABILITY TESTS
    //////////////////////////////////////////////////////////////*/

    function testIsCommodityAvailable() public view {
        assertEq(oracle.isCommodityAvailable("Cocoa"), true); // Pre-initialized

        assertEq(oracle.isCommodityAvailable("UnknownCommodity"), false);
    }

    function testGetActiveCommodities() public view {
        string[] memory active = oracle.getActiveCommodities();

        // Should have 4 pre-initialized commodities
        assertEq(active.length, 4);
    }

    /*//////////////////////////////////////////////////////////////
                        PRICE UPDATER TESTS
    //////////////////////////////////////////////////////////////*/

    function testAddPriceUpdater() public {
        oracle.addPriceUpdater(updater);

        vm.prank(updater);
        oracle.setPrice("Cocoa", 66000);

        (uint256 price,) = oracle.getPrice("Cocoa");
        assertEq(price, 66000);
    }

    function testRemovePriceUpdater() public {
        oracle.addPriceUpdater(updater);
        oracle.removePriceUpdater(updater);

        vm.prank(updater);
        vm.expectRevert(CommodityPriceOracle.UnauthorizedUpdater.selector);
        oracle.setPrice("Cocoa", 66000);
    }

    function testOnlyAuthorizedCanUpdatePrice() public {
        address unauthorized = address(0x2222);

        vm.prank(unauthorized);
        vm.expectRevert(CommodityPriceOracle.UnauthorizedUpdater.selector);
        oracle.setPrice("Cocoa", 66000);
    }
}
