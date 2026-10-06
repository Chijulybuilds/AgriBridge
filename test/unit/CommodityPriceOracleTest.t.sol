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
    address public reporterA = makeAddr("reporterA");
    address public reporterB = makeAddr("reporterB");
    address public reporterC = makeAddr("reporterC");

    uint256 public constant HEARTBEAT = 1 days;
    // World-priced (Global) and locally priced (Local) commodities from the defaults.
    uint256 public constant COCOA = CommodityDefaults.COCOA;
    uint256 public constant SOYBEANS = CommodityDefaults.SOYBEANS;
    uint256 public constant CASHEW = CommodityDefaults.CASHEW;
    uint256 public constant YAM = CommodityDefaults.YAM;

    uint128 public constant MIN_PRICE = 1 * 10 ** 6; // $0.01
    uint128 public constant MAX_PRICE = 1_000_000 * 10 ** 8; // $1,000,000.00
    uint128 public constant COCOA_PRICE = 650 * 10 ** 6; // $6.50
    uint128 public constant CASHEW_PRICE = 320 * 10 ** 6; // $3.20

    event PriceUpdated(uint256 indexed commodityId, uint256 price, uint256 timestamp, address indexed updater);
    event PriceHeld(uint256 indexed commodityId, uint256 currentPrice, uint256 heldPrice, address indexed updater);
    event PriceFeedStatusChanged(uint256 indexed commodityId, bool active);
    event LocalPriceDisputed(uint256 indexed commodityId, uint256 median, uint256 agreeingReports);

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
        oracle.addReporter(reporterA);
        oracle.addReporter(reporterB);
        oracle.addReporter(reporterC);
        vm.stopPrank();
    }

    function _setCocoa(uint128 _price) internal {
        vm.prank(priceUpdater);
        oracle.setPrice(COCOA, _price);
    }

    function _report(address _reporter, uint256 _commodityId, uint128 _price) internal {
        vm.prank(_reporter);
        oracle.submitLocalPrice(_commodityId, _price);
    }

    function _price(uint256 _commodityId) internal view returns (uint256 answer) {
        (answer,) = oracle.getPrice(_commodityId);
    }

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    function test_Constructor_SetsRolesAndState() public view {
        assertEq(oracle.VERSION(), 3);
        assertEq(oracle.decimals(), 8);
        assertEq(oracle.i_heartbeat(), HEARTBEAT);
        assertEq(address(oracle.i_config()), address(config));
        assertTrue(oracle.hasRole(oracle.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(oracle.hasRole(oracle.PRICE_UPDATER_ROLE(), admin));
        assertEq(oracle.maxMoveBps(), 1_000);
        assertEq(oracle.localQuorum(), 2);
        assertEq(oracle.localToleranceBps(), 500);
        assertEq(oracle.reporters().length, 3);
    }

    function test_Constructor_Revert_ZeroAddresses() public {
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__InvalidAddress.selector);
        new CommodityPriceOracle(address(0), config, HEARTBEAT);

        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__InvalidAddress.selector);
        new CommodityPriceOracle(admin, CommodityConfig(address(0)), HEARTBEAT);
    }

    /*//////////////////////////////////////////////////////////////
                        WORLD PRICES (UPDATER)
    //////////////////////////////////////////////////////////////*/

    function test_SetPrice_FirstPriceApplies() public {
        vm.expectEmit(true, true, false, true, address(oracle));
        emit PriceUpdated(SOYBEANS, 40e6, block.timestamp, priceUpdater);

        vm.prank(priceUpdater);
        oracle.setPrice(SOYBEANS, 40e6);

        (uint256 answer, uint256 updatedAt) = oracle.getPrice(SOYBEANS);
        assertEq(answer, 40e6);
        assertEq(updatedAt, block.timestamp);
        assertEq(oracle.getPriceFresh(SOYBEANS), 40e6);
    }

    function test_SetPrices_Batch() public {
        uint256[] memory ids = new uint256[](2);
        ids[0] = COCOA;
        ids[1] = SOYBEANS;
        uint128[] memory prices = new uint128[](2);
        prices[0] = COCOA_PRICE;
        prices[1] = 40e6;

        vm.prank(priceUpdater);
        oracle.setPrices(ids, prices);

        assertEq(oracle.getPriceFresh(COCOA), COCOA_PRICE);
        assertEq(oracle.getPriceFresh(SOYBEANS), 40e6);
    }

    function test_SetPrices_Revert_ArrayLengthMismatch() public {
        uint256[] memory ids = new uint256[](2);
        uint128[] memory prices = new uint128[](1);

        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__ArrayLengthMismatch.selector);
        vm.prank(priceUpdater);
        oracle.setPrices(ids, prices);
    }

    function test_SetPrice_Revert_LocallyPricedCommodity() public {
        vm.expectRevert(
            abi.encodeWithSelector(CommodityPriceOracle.CommodityPriceOracle__WrongPriceSource.selector, CASHEW)
        );
        vm.prank(priceUpdater);
        oracle.setPrice(CASHEW, CASHEW_PRICE);
    }

    function test_SetPrice_Revert_UnknownCommodity() public {
        vm.startPrank(priceUpdater);
        vm.expectRevert(abi.encodeWithSelector(CommodityPriceOracle.CommodityPriceOracle__UnknownCommodity.selector, 0));
        oracle.setPrice(0, COCOA_PRICE);

        vm.expectRevert(abi.encodeWithSelector(CommodityPriceOracle.CommodityPriceOracle__UnknownCommodity.selector, 7));
        oracle.setPrice(7, COCOA_PRICE);
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
        oracle.setPrice(COCOA, COCOA_PRICE);
    }

    function test_SetPrice_Revert_WhenPaused() public {
        vm.prank(admin);
        oracle.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(priceUpdater);
        oracle.setPrice(COCOA, COCOA_PRICE);
    }

    /*//////////////////////////////////////////////////////////////
                                MOVE CAP
    //////////////////////////////////////////////////////////////*/

    function test_MoveCap_SmallMoveApplies() public {
        _setCocoa(COCOA_PRICE);
        _setCocoa(COCOA_PRICE * 110 / 100); // exactly +10%
        assertEq(_price(COCOA), COCOA_PRICE * 110 / 100);
    }

    function test_MoveCap_LargeMoveIsHeld() public {
        _setCocoa(COCOA_PRICE);

        vm.expectEmit(true, true, false, true, address(oracle));
        emit PriceHeld(COCOA, COCOA_PRICE, COCOA_PRICE / 2, priceUpdater);
        _setCocoa(COCOA_PRICE / 2);

        assertEq(_price(COCOA), COCOA_PRICE, "a -50% move does not apply on its own");
        (uint256 held, uint256 since) = oracle.heldPrice(COCOA);
        assertEq(held, COCOA_PRICE / 2);
        assertEq(since, block.timestamp);
    }

    function test_MoveCap_LaterAgreeingUpdateConfirmsIt() public {
        _setCocoa(COCOA_PRICE);
        _setCocoa(COCOA_PRICE / 2); // held

        vm.warp(block.timestamp + oracle.CONFIRMATION_DELAY());
        _setCocoa(COCOA_PRICE / 2 + 5e6); // within 10% of the held price

        assertEq(_price(COCOA), COCOA_PRICE / 2 + 5e6);
        (uint256 held,) = oracle.heldPrice(COCOA);
        assertEq(held, 0);
    }

    function test_MoveCap_ConfirmationTooSoonKeepsHolding() public {
        _setCocoa(COCOA_PRICE);
        _setCocoa(COCOA_PRICE / 2);

        vm.warp(block.timestamp + oracle.CONFIRMATION_DELAY() - 1);
        _setCocoa(COCOA_PRICE / 2);

        assertEq(_price(COCOA), COCOA_PRICE);
        (, uint256 since) = oracle.heldPrice(COCOA);
        assertEq(since, block.timestamp, "the clock restarts");
    }

    function test_MoveCap_GlitchIsDroppedWhenTheNextUpdateIsNormal() public {
        _setCocoa(COCOA_PRICE);
        _setCocoa(COCOA_PRICE * 3); // a glitch: +200%, held

        vm.warp(block.timestamp + 1 hours);
        _setCocoa(COCOA_PRICE + 1e6); // back to normal

        assertEq(_price(COCOA), COCOA_PRICE + 1e6);
        (uint256 held,) = oracle.heldPrice(COCOA);
        assertEq(held, 0, "the glitch never applied and is forgotten");
    }

    function test_ForcePrice_BypassesTheCapAndWorksWhilePaused() public {
        _setCocoa(COCOA_PRICE);
        vm.startPrank(admin);
        oracle.pause();
        oracle.forcePrice(COCOA, COCOA_PRICE / 2);
        oracle.unpause();
        vm.stopPrank();

        assertEq(oracle.getPriceFresh(COCOA), COCOA_PRICE / 2);
    }

    function test_ForcePrice_Revert_NotAdmin() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, priceUpdater, oracle.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(priceUpdater);
        oracle.forcePrice(COCOA, COCOA_PRICE);
    }

    /*//////////////////////////////////////////////////////////////
                    FEEDS, FRESHNESS AND THE BREAKER
    //////////////////////////////////////////////////////////////*/

    function test_GetPrice_Revert_NeverSet() public {
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceFeedInactive.selector);
        oracle.getPrice(COCOA);

        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceFeedInactive.selector);
        oracle.getPriceFresh(COCOA);
    }

    function test_SetFeedStatus_StaysOffUntilTheAdminTurnsItOn() public {
        _setCocoa(COCOA_PRICE);

        vm.expectEmit(true, false, false, true, address(oracle));
        emit PriceFeedStatusChanged(COCOA, false);
        vm.prank(admin);
        oracle.setFeedStatus(COCOA, false);

        // A new price does not quietly switch a feed the admin turned off back on.
        _setCocoa(COCOA_PRICE);
        assertFalse(oracle.isFresh(COCOA));
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceFeedInactive.selector);
        oracle.getPriceFresh(COCOA);

        vm.prank(admin);
        oracle.setFeedStatus(COCOA, true);
        assertEq(oracle.getPriceFresh(COCOA), COCOA_PRICE);
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
        _setCocoa(COCOA_PRICE);

        vm.warp(block.timestamp + HEARTBEAT);
        assertTrue(oracle.isFresh(COCOA));
        assertEq(oracle.getPriceFresh(COCOA), COCOA_PRICE);

        vm.warp(block.timestamp + 1);
        assertFalse(oracle.isFresh(COCOA));
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceStale.selector);
        oracle.getPriceFresh(COCOA);

        // A stale price is still readable for display, with its timestamp.
        assertEq(_price(COCOA), COCOA_PRICE);
    }

    function test_SetHeartbeat_PerCommodity() public {
        vm.prank(admin);
        oracle.setHeartbeat(YAM, 7 days);
        assertEq(oracle.heartbeatOf(YAM), 7 days);
        assertEq(oracle.heartbeatOf(COCOA), HEARTBEAT);

        vm.prank(admin);
        oracle.setHeartbeat(YAM, 0);
        assertEq(oracle.heartbeatOf(YAM), HEARTBEAT, "zero restores the default");
    }

    function test_Pause_IsTheCircuitBreaker() public {
        _setCocoa(COCOA_PRICE);
        vm.prank(admin);
        oracle.pause();

        assertFalse(oracle.isFresh(COCOA));
        vm.expectRevert(Pausable.EnforcedPause.selector);
        oracle.getPriceFresh(COCOA);
    }

    /*//////////////////////////////////////////////////////////////
                        LOCAL PRICES (REPORTERS)
    //////////////////////////////////////////////////////////////*/

    function test_Local_OneReportIsNotEnough() public {
        _report(reporterA, CASHEW, CASHEW_PRICE);

        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceFeedInactive.selector);
        oracle.getPrice(CASHEW);
        (uint256 price, uint256 reportedAt) = oracle.getReport(CASHEW, reporterA);
        assertEq(price, CASHEW_PRICE);
        assertEq(reportedAt, block.timestamp);
    }

    function test_Local_TwoAgreeingReportsSetTheMedian() public {
        _report(reporterA, CASHEW, 320e6);
        _report(reporterB, CASHEW, 330e6); // 3% apart

        assertEq(oracle.getPriceFresh(CASHEW), 325e6, "median of the two");
    }

    function test_Local_DisagreeingReportsChangeNothing() public {
        _report(reporterA, CASHEW, 320e6);

        vm.expectEmit(true, false, false, true, address(oracle));
        emit LocalPriceDisputed(CASHEW, 395e6, 0);
        _report(reporterB, CASHEW, 470e6); // far apart: neither is within 5% of the median

        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceFeedInactive.selector);
        oracle.getPrice(CASHEW);
    }

    function test_Local_OutlierIsOutvoted() public {
        _report(reporterA, YAM, 85e6);
        _report(reporterB, YAM, 1_000e6); // a wrong or dishonest report
        _report(reporterC, YAM, 87e6);

        // Median of the three is $0.87; two reports agree with it, so it stands.
        assertEq(oracle.getPriceFresh(YAM), 87e6);
    }

    function test_Local_StaleReportsDoNotCount() public {
        _report(reporterA, CASHEW, 320e6);
        vm.warp(block.timestamp + HEARTBEAT + 1);
        _report(reporterB, CASHEW, 321e6);

        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceFeedInactive.selector);
        oracle.getPrice(CASHEW);
    }

    function test_Local_RemovedReporterNoLongerCounts() public {
        _report(reporterA, CASHEW, 320e6);
        vm.prank(admin);
        oracle.removeReporter(reporterA);
        _report(reporterB, CASHEW, 321e6);

        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__PriceFeedInactive.selector);
        oracle.getPrice(CASHEW);
        assertFalse(oracle.isReporter(reporterA));
        assertEq(oracle.reporters().length, 2);
    }

    function test_Local_ConsensusStillRespectsTheMoveCap() public {
        _report(reporterA, CASHEW, 320e6);
        _report(reporterB, CASHEW, 320e6);

        vm.warp(block.timestamp + 1 hours);
        _report(reporterA, CASHEW, 160e6);
        _report(reporterB, CASHEW, 160e6); // agreed, but -50%: held

        assertEq(_price(CASHEW), 320e6);
        (uint256 held,) = oracle.heldPrice(CASHEW);
        assertEq(held, 160e6);
    }

    function test_Local_Revert_NotAReporterOrWorldPricedCommodity() public {
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__NotReporter.selector);
        vm.prank(stranger);
        oracle.submitLocalPrice(CASHEW, CASHEW_PRICE);

        vm.expectRevert(
            abi.encodeWithSelector(CommodityPriceOracle.CommodityPriceOracle__WrongPriceSource.selector, COCOA)
        );
        vm.prank(reporterA);
        oracle.submitLocalPrice(COCOA, COCOA_PRICE);
    }

    function test_AddReporter_Revert_DuplicateZeroOrTooMany() public {
        vm.startPrank(admin);
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__ReporterExists.selector);
        oracle.addReporter(reporterA);

        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__InvalidAddress.selector);
        oracle.addReporter(address(0));

        for (uint256 i = 0; i < 4; i++) {
            oracle.addReporter(address(uint160(1_000 + i)));
        }
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__TooManyReporters.selector);
        oracle.addReporter(address(uint160(2_000)));
        vm.stopPrank();
    }

    function test_SetRiskParameters_BoundsAndUpdate() public {
        vm.startPrank(admin);
        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__InvalidParameters.selector);
        oracle.setRiskParameters(0, 2, 500);

        vm.expectRevert(CommodityPriceOracle.CommodityPriceOracle__InvalidParameters.selector);
        oracle.setRiskParameters(1_000, 8, 500);

        oracle.setRiskParameters(500, 3, 300);
        vm.stopPrank();

        assertEq(oracle.maxMoveBps(), 500);
        assertEq(oracle.localQuorum(), 3);
        assertEq(oracle.localToleranceBps(), 300);
    }
}
