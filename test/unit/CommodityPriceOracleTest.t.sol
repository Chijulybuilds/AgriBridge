// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CommodityPriceOracle} from "src/CommodityPriceOracle.sol";
import {ICommodityPriceOracle} from "src/interfaces/ICommodityPriceOracle.sol";
import {DataTypes} from "src/interfaces/ICommodityRegistry.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract CommodityPriceOracleTest is Test {
    CommodityPriceOracle public oracle;

    // Roles and Accounts
    address public admin = makeAddr("admin");
    address public priceUpdater = makeAddr("priceUpdater");
    address public stranger = makeAddr("stranger");

    uint256 public constant HEARTBEAT = 1 days;

    // Price Boundary Constants (Matching Oracle configuration)
    uint128 public constant MIN_PRICE = 1 * 10 ** 6; // $0.01
    uint128 public constant MAX_PRICE = 1_000_000 * 10 ** 8; // $1,000,000.00
    uint128 public constant VALID_PRICE = 2500 * 10 ** 8; // $2,500.00

    // Events matching the oracle interface
    event PriceUpdated(
        ICommodityPriceOracle.CommodityType indexed commodity,
        uint256 indexed newPrice,
        uint256 timestamp,
        address indexed updater
    );
    event PriceFeedStatusChanged(ICommodityPriceOracle.CommodityType indexed commodity, bool indexed status);

    function setUp() public {
        // Fix initial block timestamp away from 0 to prevent issues with backward calculations
        vm.warp(100 weeks);

        // Deploy oracle tracking admin and heartbeat criteria
        oracle = new CommodityPriceOracle(admin, HEARTBEAT);

        // Grant roles cleanly matching access rules
        vm.startPrank(admin);
        oracle.grantRole(oracle.PRICE_UPDATER_ROLE(), priceUpdater);
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    function test_Constructor_SetsInitialRolesAndState() public view {
        assertEq(oracle.VERSION(), 1);
        assertEq(oracle.decimals(), 8);
        assertEq(oracle.i_heartbeat(), HEARTBEAT);
        assertTrue(oracle.hasRole(oracle.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(oracle.hasRole(oracle.PRICE_UPDATER_ROLE(), admin));
    }

    /*//////////////////////////////////////////////////////////////
                               SET PRICES
    //////////////////////////////////////////////////////////////*/

    function test_SetPrices_Success() public {
        ICommodityPriceOracle.CommodityType[] memory commodities = new ICommodityPriceOracle.CommodityType[](2);
        commodities[0] = ICommodityPriceOracle.CommodityType.Cocoa;
        commodities[1] = ICommodityPriceOracle.CommodityType.Rice;

        uint128[] memory prices = new uint128[](2);
        prices[0] = VALID_PRICE;
        prices[1] = VALID_PRICE + 500 * 10 ** 8;

        vm.prank(priceUpdater);
        vm.expectEmit(true, true, false, true);
        emit PriceUpdated(ICommodityPriceOracle.CommodityType.Cocoa, prices[0], block.timestamp, priceUpdater);
        oracle.setPrices(commodities, prices);

        (uint256 priceCocoa, uint256 updatedCocoa) = oracle.getPrice(ICommodityPriceOracle.CommodityType.Cocoa);
        assertEq(priceCocoa, prices[0]);
        assertEq(updatedCocoa, block.timestamp);
    }

    function test_SetPrices_Revert_ArrayLengthMismatch() public {
        ICommodityPriceOracle.CommodityType[] memory commodities = new ICommodityPriceOracle.CommodityType[](2);
        commodities[0] = ICommodityPriceOracle.CommodityType.Cocoa;
        commodities[1] = ICommodityPriceOracle.CommodityType.Rice;

        uint128[] memory prices = new uint128[](1);
        prices[0] = VALID_PRICE;

        vm.prank(priceUpdater);
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__ArrayLengthMismatch.selector);
        oracle.setPrices(commodities, prices);
    }

    function test_SetPrices_Revert_Unauthorized() public {
        ICommodityPriceOracle.CommodityType[] memory commodities = new ICommodityPriceOracle.CommodityType[](1);
        uint128[] memory prices = new uint128[](1);

        // Expect the revert using the dynamic address of 'stranger'
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                stranger, // <--- ENFORCE THIS MATCHES THE PRANK TARGET EXACTLY
                oracle.PRICE_UPDATER_ROLE()
            )
        );

        vm.prank(stranger);
        oracle.setPrices(commodities, prices);
    }

    /*//////////////////////////////////////////////////////////////
                               SET PRICE
    //////////////////////////////////////////////////////////////*/

    function test_SetPrice_Success() public {
        vm.prank(priceUpdater);
        oracle.setPrice(ICommodityPriceOracle.CommodityType.Maize, VALID_PRICE);

        (uint256 price,) = oracle.getPrice(ICommodityPriceOracle.CommodityType.Maize);
        assertEq(price, VALID_PRICE);
    }

    function test_SetPrice_Revert_InvalidPrice_TooLow() public {
        vm.prank(priceUpdater);
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__InvalidPrice.selector);
        oracle.setPrice(ICommodityPriceOracle.CommodityType.Maize, MIN_PRICE - 1);
    }

    function test_SetPrice_Revert_InvalidPrice_TooHigh() public {
        vm.prank(priceUpdater);
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__InvalidPrice.selector);
        oracle.setPrice(ICommodityPriceOracle.CommodityType.Maize, MAX_PRICE + 1);
    }

    function test_SetPrice_Revert_InvalidTimestamp() public {
        vm.prank(priceUpdater);
        oracle.setPrice(ICommodityPriceOracle.CommodityType.Cashew, VALID_PRICE);

        // Roll back the EVM block timestamp to simulate an impossible time travel regression scenario
        vm.warp(block.timestamp - 1);

        vm.prank(priceUpdater);
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__InvalidTimestamp.selector);
        oracle.setPrice(ICommodityPriceOracle.CommodityType.Cashew, VALID_PRICE);
    }

    /*//////////////////////////////////////////////////////////////
                          INITIALIZE COMMODITY
    //////////////////////////////////////////////////////////////*/

    function test_InitializeCommodity_Success() public {
        vm.prank(admin);
        oracle.initializeCommodity(ICommodityPriceOracle.CommodityType.Yam, VALID_PRICE);

        (uint256 price,) = oracle.getPrice(ICommodityPriceOracle.CommodityType.Yam);
        assertEq(price, VALID_PRICE);
    }

    function test_InitializeCommodity_Revert_Unauthorized() public {
        // If you don't use vm.prank here, the caller is the test contract itself: address(this)
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                address(this), // <--- CHANGE THIS FROM priceUpdater TO address(this)
                oracle.DEFAULT_ADMIN_ROLE()
            )
        );
        oracle.initializeCommodity(ICommodityPriceOracle.CommodityType.Yam, VALID_PRICE);
    }

    /*//////////////////////////////////////////////////////////////
                             FEED STATUS
    //////////////////////////////////////////////////////////////*/

    function test_SetFeedStatus_CanDeactivateAndReactivate() public {
        // Initialize active profile path
        vm.prank(admin);
        oracle.initializeCommodity(ICommodityPriceOracle.CommodityType.Cocoa, VALID_PRICE);

        // Turn off tracking status
        vm.prank(admin);
        vm.expectEmit(true, true, false, true);
        emit PriceFeedStatusChanged(ICommodityPriceOracle.CommodityType.Cocoa, false);
        oracle.setFeedStatus(ICommodityPriceOracle.CommodityType.Cocoa, false);

        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceFeedInactive.selector);
        oracle.getPrice(ICommodityPriceOracle.CommodityType.Cocoa);
    }

    /*//////////////////////////////////////////////////////////////
                              VIEW GETTERS
    //////////////////////////////////////////////////////////////*/

    function test_GetPrice_Revert_Inactive() public {
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceFeedInactive.selector);
        oracle.getPrice(ICommodityPriceOracle.CommodityType.Yam);
    }

    function test_GetPriceFresh_Success() public {
        vm.prank(admin);
        oracle.initializeCommodity(ICommodityPriceOracle.CommodityType.Rice, VALID_PRICE);

        // Warp time right up to the maximum heartbeat ceiling margin limit
        vm.warp(block.timestamp + HEARTBEAT);
        assertEq(oracle.getPriceFresh(ICommodityPriceOracle.CommodityType.Rice), VALID_PRICE);
    }

    function test_GetPriceFresh_Revert_Stale() public {
        vm.prank(admin);
        oracle.initializeCommodity(ICommodityPriceOracle.CommodityType.Rice, VALID_PRICE);

        // Warp past fresh bounds parameters
        vm.warp(block.timestamp + HEARTBEAT + 1 seconds);
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceStale.selector);
        oracle.getPriceFresh(ICommodityPriceOracle.CommodityType.Rice);
    }

    function test_IsFresh_ReturnsCorrectStatus() public {
        ICommodityPriceOracle.CommodityType target = ICommodityPriceOracle.CommodityType.Maize;

        // Inactive entries should cleanly return false without throwing a revert panic
        assertFalse(oracle.isFresh(target));

        vm.prank(admin);
        oracle.initializeCommodity(target, VALID_PRICE);
        assertTrue(oracle.isFresh(target));

        vm.warp(block.timestamp + HEARTBEAT + 1 seconds);
        assertFalse(oracle.isFresh(target));
    }

    function test_GetPriceFreshData_InteroperabilityLayout() public {
        vm.prank(admin);
        oracle.initializeCommodity(ICommodityPriceOracle.CommodityType.Cashew, VALID_PRICE);

        // Map external data-types structure mapping definitions cleanly to test visibility
        DataTypes.CommodityType registryEnumCashew = DataTypes.CommodityType(3); // Variant index 3

        assertEq(oracle.getPriceFreshData(registryEnumCashew), VALID_PRICE);

        vm.warp(block.timestamp + HEARTBEAT + 1 seconds);
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceStale.selector);
        oracle.getPriceFreshData(registryEnumCashew);
    }

    /*//////////////////////////////////////////////////////////////
                            PAUSABLE LOCKS
    //////////////////////////////////////////////////////////////*/

    function test_Pausable_LocksPriceUpdates() public {
        vm.prank(admin);
        oracle.pause();

        ICommodityPriceOracle.CommodityType[] memory commodities = new ICommodityPriceOracle.CommodityType[](1);
        uint128[] memory prices = new uint128[](1);

        vm.prank(priceUpdater);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        oracle.setPrice(ICommodityPriceOracle.CommodityType.Cocoa, VALID_PRICE);

        vm.prank(priceUpdater);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        oracle.setPrices(commodities, prices);

        // Open layout blocks again
        vm.prank(admin);
        oracle.unpause();

        vm.prank(priceUpdater);
        oracle.setPrice(ICommodityPriceOracle.CommodityType.Cocoa, VALID_PRICE);
        (uint256 price,) = oracle.getPrice(ICommodityPriceOracle.CommodityType.Cocoa);
        assertEq(price, VALID_PRICE);
    }

    /*//////////////////////////////////////////////////////////////
                    COMMODITY-ID KEYED COLLATERAL VIEWS
    //////////////////////////////////////////////////////////////*/

    uint256 private constant COCOA_ID = 1;
    uint128 private constant COCOA_PRICE = 650 * 10 ** 6; // $6.50/kg, 8 decimals

    /// @dev Wires a registry stub that reports commodity `COCOA_ID` as Cocoa, and prices Cocoa.
    function _setUpCollateralValuation() private returns (MockRegistry registry) {
        registry = new MockRegistry(uint8(ICommodityPriceOracle.CommodityType.Cocoa));

        vm.prank(admin);
        oracle.setCommodityRegistry(address(registry));

        vm.prank(priceUpdater);
        oracle.setPrice(ICommodityPriceOracle.CommodityType.Cocoa, COCOA_PRICE);
    }

    /**
     * @notice The decimal contract LendingPool depends on: an 8-decimal price and an 18-decimal
     *         quantity must produce a 6-decimal USD value.
     * @dev 1,000 kg of cocoa at $6.50/kg is $6,500.00, which in USDC's 6 decimals is 6_500_000_000.
     *      Getting this wrong by any power of ten silently mis-prices every loan.
     */
    function test_GetCollateralValue_ReturnsSixDecimalUsd() public {
        _setUpCollateralValuation();

        uint256 quantity = 1000e18; // 1,000 kg, 18 decimals
        uint256 value = oracle.getCollateralValue(COCOA_ID, quantity);

        assertEq(value, 6_500_000_000, "1000kg cocoa at $6.50/kg should be $6,500 in 6-decimal USD");
    }

    function test_GetCollateralValue_ScalesLinearlyWithQuantity() public {
        _setUpCollateralValuation();

        uint256 single = oracle.getCollateralValue(COCOA_ID, 1e18);
        uint256 double = oracle.getCollateralValue(COCOA_ID, 2e18);

        assertEq(single, 6_500_000, "1kg cocoa at $6.50/kg should be $6.50");
        assertEq(double, single * 2);
    }

    function test_GetCommodityPrice_ReturnsFeedPriceForResolvedType() public {
        _setUpCollateralValuation();

        assertEq(oracle.getCommodityPrice(COCOA_ID), COCOA_PRICE);
    }

    /**
     * @notice A stale feed must not be borrowable against.
     */
    function test_GetCollateralValue_RevertsOnStalePrice() public {
        _setUpCollateralValuation();

        vm.warp(block.timestamp + HEARTBEAT + 1);

        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceStale.selector);
        oracle.getCollateralValue(COCOA_ID, 1000e18);
    }

    function test_GetCollateralValue_RevertsWhenFeedInactive() public {
        MockRegistry registry = new MockRegistry(uint8(ICommodityPriceOracle.CommodityType.Yam));

        vm.prank(admin);
        oracle.setCommodityRegistry(address(registry));

        // Yam has never been priced, so its feed is inactive.
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceFeedInactive.selector);
        oracle.getCollateralValue(COCOA_ID, 1000e18);
    }

    function test_GetCollateralValue_RevertsWhenRegistryNotSet() public {
        vm.prank(priceUpdater);
        oracle.setPrice(ICommodityPriceOracle.CommodityType.Cocoa, COCOA_PRICE);

        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__RegistryNotSet.selector);
        oracle.getCollateralValue(COCOA_ID, 1000e18);
    }

    function test_SetCommodityRegistry_AccessControlAndValidation() public {
        MockRegistry registry = new MockRegistry(uint8(ICommodityPriceOracle.CommodityType.Cocoa));

        vm.prank(stranger);
        vm.expectRevert();
        oracle.setCommodityRegistry(address(registry));

        vm.prank(admin);
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__InvalidAddress.selector);
        oracle.setCommodityRegistry(address(0));

        vm.prank(admin);
        oracle.setCommodityRegistry(address(registry));
        assertEq(address(oracle.commodityRegistry()), address(registry));
    }
}

/**
 * @notice Minimal CommodityRegistry stand-in returning a fixed commodity type.
 * @dev Matches the tuple layout of `CommodityRegistry.getCommodity`.
 */
contract MockRegistry {
    uint8 private immutable i_commodityType;

    constructor(uint8 _commodityType) {
        i_commodityType = _commodityType;
    }

    function getCommodity(uint256)
        external
        view
        returns (address, uint8, uint8, uint8, address, uint96, uint64, uint64, uint64, uint64, bytes32)
    {
        return (address(0xFA), 1, i_commodityType, 0, address(0), 1000e18, 0, 0, 0, 0, bytes32(0));
    }
}
