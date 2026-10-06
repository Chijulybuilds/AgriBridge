// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {CommodityConfig} from "src/CommodityConfig.sol";
import {CommodityPriceOracle} from "src/CommodityPriceOracle.sol";
import {CommodityDefaults} from "script/CommodityDefaults.sol";

contract CommodityPriceOracleTest is Test {
    CommodityConfig public config;
    CommodityPriceOracle public oracle;

    address public admin = makeAddr("admin");
    address public priceUpdater = makeAddr("priceUpdater");
    address public stranger = makeAddr("stranger");

    uint256 public constant HEARTBEAT = 1 days;
    uint256 public constant COCOA = CommodityDefaults.COCOA;
    uint256 public constant SOYBEANS = CommodityDefaults.SOYBEANS;

    uint128 public constant MIN_PRICE = 1 * 10 ** 6; // $0.01
    uint128 public constant MAX_PRICE = 1_000_000 * 10 ** 8; // $1,000,000.00
    uint128 public constant VALID_PRICE = 650 * 10 ** 6; // $6.50

    event PriceUpdated(uint256 indexed commodityId, uint256 price, uint256 timestamp, address indexed updater);
    event PriceFeedStatusChanged(uint256 indexed commodityId, bool active);

    function setUp() public {
        vm.warp(100 weeks);

        config = new CommodityConfig(admin);
        CommodityConfig.Commodity[] memory rows = CommodityDefaults.all();
        vm.startPrank(admin);
        for (uint256 i = 0; i < rows.length; i++) {
            config.addCommodity(rows[i]);
        }
        vm.stopPrank();

        oracle = new CommodityPriceOracle(admin, config, HEARTBEAT);

        vm.startPrank(admin);
        oracle.grantRole(oracle.PRICE_UPDATER_ROLE(), priceUpdater);
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    function test_Constructor_SetsRolesAndState() public view {
        assertEq(oracle.VERSION(), 2);
        assertEq(oracle.decimals(), 8);
        assertEq(oracle.i_heartbeat(), HEARTBEAT);
        assertEq(address(oracle.i_config()), address(config));
        assertTrue(oracle.hasRole(oracle.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(oracle.hasRole(oracle.PRICE_UPDATER_ROLE(), admin));
    }

    function test_Constructor_Revert_ZeroAddresses() public {
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__InvalidAddress.selector);
        new CommodityPriceOracle(address(0), config, HEARTBEAT);

        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__InvalidAddress.selector);
        new CommodityPriceOracle(admin, CommodityConfig(address(0)), HEARTBEAT);
    }

    /*//////////////////////////////////////////////////////////////
                               SET PRICES
    //////////////////////////////////////////////////////////////*/

    function test_SetPrice_StoresAndEmits() public {
        vm.expectEmit(true, true, false, true, address(oracle));
        emit PriceUpdated(SOYBEANS, VALID_PRICE, block.timestamp, priceUpdater);

        vm.prank(priceUpdater);
        oracle.setPrice(SOYBEANS, VALID_PRICE);

        (uint256 answer, uint256 updatedAt) = oracle.getPrice(SOYBEANS);
        assertEq(answer, VALID_PRICE);
        assertEq(updatedAt, block.timestamp);
        assertEq(oracle.getPriceFresh(SOYBEANS), VALID_PRICE);
    }

    function test_SetPrices_Batch() public {
        uint256[] memory ids = new uint256[](2);
        ids[0] = COCOA;
        ids[1] = SOYBEANS;
        uint128[] memory prices = new uint128[](2);
        prices[0] = VALID_PRICE;
        prices[1] = 40 * 10 ** 6;

        vm.prank(priceUpdater);
        oracle.setPrices(ids, prices);

        assertEq(oracle.getPriceFresh(COCOA), VALID_PRICE);
        assertEq(oracle.getPriceFresh(SOYBEANS), 40 * 10 ** 6);
    }

    function test_SetPrices_Revert_ArrayLengthMismatch() public {
        uint256[] memory ids = new uint256[](2);
        uint128[] memory prices = new uint128[](1);

        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__ArrayLengthMismatch.selector);
        vm.prank(priceUpdater);
        oracle.setPrices(ids, prices);
    }

    function test_SetPrice_Revert_UnknownCommodity() public {
        vm.startPrank(priceUpdater);
        vm.expectRevert(abi.encodeWithSelector(CommodityPriceOracle.CommodityPriceOracle__UnknownCommodity.selector, 0));
        oracle.setPrice(0, VALID_PRICE);

        vm.expectRevert(abi.encodeWithSelector(CommodityPriceOracle.CommodityPriceOracle__UnknownCommodity.selector, 7));
        oracle.setPrice(7, VALID_PRICE);
        vm.stopPrank();
    }

    function test_SetPrice_Revert_OutOfBounds() public {
        vm.startPrank(priceUpdater);
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__InvalidPrice.selector);
        oracle.setPrice(COCOA, MIN_PRICE - 1);

        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__InvalidPrice.selector);
        oracle.setPrice(COCOA, MAX_PRICE + 1);
        vm.stopPrank();
    }

    function test_SetPrice_Revert_Unauthorized() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, oracle.PRICE_UPDATER_ROLE()
            )
        );
        vm.prank(stranger);
        oracle.setPrice(COCOA, VALID_PRICE);
    }

    function test_SetPrice_Revert_WhenPaused() public {
        vm.prank(admin);
        oracle.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(priceUpdater);
        oracle.setPrice(COCOA, VALID_PRICE);
    }

    /*//////////////////////////////////////////////////////////////
                           FEEDS AND FRESHNESS
    //////////////////////////////////////////////////////////////*/

    function test_GetPrice_Revert_NeverSet() public {
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceFeedInactive.selector);
        oracle.getPrice(COCOA);

        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceFeedInactive.selector);
        oracle.getPriceFresh(COCOA);
    }

    function test_SetFeedStatus_DeactivatesAndReactivates() public {
        vm.prank(priceUpdater);
        oracle.setPrice(COCOA, VALID_PRICE);

        vm.expectEmit(true, false, false, true, address(oracle));
        emit PriceFeedStatusChanged(COCOA, false);
        vm.prank(admin);
        oracle.setFeedStatus(COCOA, false);

        assertFalse(oracle.isFresh(COCOA));
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceFeedInactive.selector);
        oracle.getPriceFresh(COCOA);

        vm.prank(admin);
        oracle.setFeedStatus(COCOA, true);
        assertEq(oracle.getPriceFresh(COCOA), VALID_PRICE);
    }

    function test_SetFeedStatus_Revert_UnknownOrNotAdmin() public {
        vm.expectRevert(abi.encodeWithSelector(CommodityPriceOracle.CommodityPriceOracle__UnknownCommodity.selector, 9));
        vm.prank(admin);
        oracle.setFeedStatus(9, true);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, priceUpdater, oracle.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(priceUpdater);
        oracle.setFeedStatus(COCOA, false);
    }

    function test_GetPriceFresh_RevertsOnceStale() public {
        vm.prank(priceUpdater);
        oracle.setPrice(COCOA, VALID_PRICE);

        vm.warp(block.timestamp + HEARTBEAT);
        assertTrue(oracle.isFresh(COCOA));
        assertEq(oracle.getPriceFresh(COCOA), VALID_PRICE);

        vm.warp(block.timestamp + 1);
        assertFalse(oracle.isFresh(COCOA));
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceStale.selector);
        oracle.getPriceFresh(COCOA);

        // A stale price is still readable for display, with its timestamp.
        (uint256 answer,) = oracle.getPrice(COCOA);
        assertEq(answer, VALID_PRICE);
    }
}
