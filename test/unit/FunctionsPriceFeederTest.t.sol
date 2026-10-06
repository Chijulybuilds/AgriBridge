// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IFunctionsRouter} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/interfaces/IFunctionsRouter.sol";
import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_3_0/FunctionsClient.sol";

import {FunctionsPriceFeeder} from "src/oracle/FunctionsPriceFeeder.sol";
import {ProtocolFixture} from "test/utils/ProtocolFixture.sol";

contract FunctionsPriceFeederTest is ProtocolFixture {
    FunctionsPriceFeeder internal feeder;

    address internal router = makeAddr("functionsRouter");
    address internal stranger = makeAddr("stranger");

    bytes32 internal constant REQUEST_ID = keccak256("request 1");
    uint128 internal constant COCOA_PRICE = 650 * 10 ** 6; // seeded by the fixture
    uint128 internal constant SOY_PRICE = 40 * 10 ** 6;

    event PriceDelivered(bytes32 indexed requestId, uint256 indexed commodityId, uint256 price);
    event PriceRejected(bytes32 indexed requestId, uint256 indexed commodityId, uint256 price, bytes reason);
    event RequestFailed(bytes32 indexed requestId, bytes reason);
    event UnexpectedResponse(bytes32 indexed requestId);

    function setUp() public {
        _deployFixture();
        vm.etch(router, hex"00");
        vm.mockCall(router, abi.encodeWithSelector(IFunctionsRouter.sendRequest.selector), abi.encode(REQUEST_ID));

        feeder = new FunctionsPriceFeeder(router, address(d.oracle), address(this));
        d.oracle.grantRole(d.oracle.PRICE_UPDATER_ROLE(), address(feeder));
    }

    function _configure(uint256[] memory _ids, string[] memory _symbols) internal {
        feeder.setSettings(
            FunctionsPriceFeeder.Settings({
                donId: bytes32("fun-ethereum-sepolia-1"),
                subscriptionId: 42,
                callbackGasLimit: 300_000,
                secretsSlotId: 0,
                secretsVersion: 0,
                minRequestInterval: 1 hours
            })
        );
        feeder.setSource("return Functions.encodeUint256(1);");
        feeder.setCommodities(_ids, _symbols);
    }

    function _configureCocoaAndSoy() internal {
        uint256[] memory ids = new uint256[](2);
        ids[0] = COCOA;
        ids[1] = SOYBEANS;
        string[] memory symbols = new string[](2);
        symbols[0] = "COCOA";
        symbols[1] = "SOYBEANS";
        _configure(ids, symbols);
    }

    function _fulfil(bytes32 _requestId, bytes memory _response, bytes memory _err) internal {
        vm.prank(router);
        feeder.handleOracleFulfillment(_requestId, _response, _err);
    }

    function _prices(uint256 _a, uint256 _b) internal pure returns (bytes memory) {
        uint256[] memory prices = new uint256[](2);
        prices[0] = _a;
        prices[1] = _b;
        return abi.encode(prices);
    }

    function _price(uint256 _commodityId) internal view returns (uint256 answer) {
        (answer,) = d.oracle.getPrice(_commodityId);
    }

    /*//////////////////////////////////////////////////////////////
                               REQUESTS
    //////////////////////////////////////////////////////////////*/

    function test_RequestPrices_Revert_NotConfigured() public {
        vm.expectRevert(FunctionsPriceFeeder.FunctionsPriceFeeder__NotConfigured.selector);
        feeder.requestPrices();
    }

    function test_RequestPrices_SendsAndIsRateLimited() public {
        _configureCocoaAndSoy();

        assertEq(feeder.requestPrices(), REQUEST_ID);
        assertEq(feeder.lastRequestId(), REQUEST_ID);
        assertEq(feeder.lastRequestAt(), block.timestamp);

        vm.expectRevert(FunctionsPriceFeeder.FunctionsPriceFeeder__TooSoon.selector);
        feeder.requestPrices();

        vm.warp(block.timestamp + 1 hours);
        feeder.requestPrices();
    }

    function test_Upkeep_FollowsTheInterval() public {
        (bool needed,) = feeder.checkUpkeep("");
        assertFalse(needed, "not configured yet");

        _configureCocoaAndSoy();
        (needed,) = feeder.checkUpkeep("");
        assertTrue(needed);

        feeder.performUpkeep("");
        (needed,) = feeder.checkUpkeep("");
        assertFalse(needed, "just requested");

        vm.warp(block.timestamp + 1 hours);
        (needed,) = feeder.checkUpkeep("");
        assertTrue(needed);
    }

    /*//////////////////////////////////////////////////////////////
                              FULFILMENT
    //////////////////////////////////////////////////////////////*/

    function test_Fulfil_DeliversPricesToTheOracle() public {
        _configureCocoaAndSoy();
        feeder.requestPrices();

        vm.expectEmit(true, true, false, true, address(feeder));
        emit PriceDelivered(REQUEST_ID, COCOA, 660e6);
        _fulfil(REQUEST_ID, _prices(660e6, 41e6), "");

        assertEq(d.oracle.getPriceFresh(COCOA), 660e6);
        assertEq(d.oracle.getPriceFresh(SOYBEANS), 41e6);
    }

    function test_Fulfil_LargeMoveIsHeldByTheOracle() public {
        _configureCocoaAndSoy();
        feeder.requestPrices();
        _fulfil(REQUEST_ID, _prices(COCOA_PRICE * 2, SOY_PRICE), "");

        assertEq(_price(COCOA), COCOA_PRICE, "the oracle's move cap still applies");
        (uint256 held,) = d.oracle.heldPrice(COCOA);
        assertEq(held, COCOA_PRICE * 2);
    }

    function test_Fulfil_ErrorIsRecordedAndChangesNothing() public {
        _configureCocoaAndSoy();
        feeder.requestPrices();

        vm.expectEmit(true, false, false, true, address(feeder));
        emit RequestFailed(REQUEST_ID, "only 1 of 3 providers answered");
        _fulfil(REQUEST_ID, "", "only 1 of 3 providers answered");

        assertEq(feeder.lastError(), "only 1 of 3 providers answered");
        assertEq(_price(COCOA), COCOA_PRICE);
    }

    function test_Fulfil_OneRejectedPriceDoesNotBlockTheOthers() public {
        // Cashew is priced by local reporters, so the oracle refuses a world price for it.
        uint256[] memory ids = new uint256[](2);
        ids[0] = CASHEW;
        ids[1] = COCOA;
        string[] memory symbols = new string[](2);
        symbols[0] = "CASHEW";
        symbols[1] = "COCOA";
        _configure(ids, symbols);
        feeder.requestPrices();

        _fulfil(REQUEST_ID, _prices(300e6, 640e6), "");

        assertEq(_price(COCOA), 640e6);
        assertEq(_price(CASHEW), 320e6, "unchanged");
    }

    function test_Fulfil_MalformedOrWrongLengthIsIgnored() public {
        _configureCocoaAndSoy();
        feeder.requestPrices();

        vm.expectEmit(true, false, false, false, address(feeder));
        emit UnexpectedResponse(REQUEST_ID);
        _fulfil(REQUEST_ID, hex"1234", "");

        uint256[] memory one = new uint256[](1);
        one[0] = 660e6;
        vm.expectEmit(true, false, false, false, address(feeder));
        emit UnexpectedResponse(REQUEST_ID);
        _fulfil(REQUEST_ID, abi.encode(one), "");

        assertEq(_price(COCOA), COCOA_PRICE);
    }

    function test_Fulfil_AnOldRequestIsIgnored() public {
        _configureCocoaAndSoy();
        feeder.requestPrices();

        bytes32 old = keccak256("an earlier request");
        vm.expectEmit(true, false, false, false, address(feeder));
        emit UnexpectedResponse(old);
        _fulfil(old, _prices(660e6, 41e6), "");

        assertEq(_price(COCOA), COCOA_PRICE);
    }

    function test_Fulfil_Revert_OnlyTheRouter() public {
        vm.expectRevert(FunctionsClient.OnlyRouterCanFulfill.selector);
        vm.prank(stranger);
        feeder.handleOracleFulfillment(REQUEST_ID, _prices(1, 1), "");
    }

    /*//////////////////////////////////////////////////////////////
                                 ADMIN
    //////////////////////////////////////////////////////////////*/

    function test_Admin_Revert_NotAdmin() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, feeder.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(stranger);
        feeder.setSource("malicious");
    }

    function test_SetCommodities_Revert_LengthMismatch() public {
        uint256[] memory ids = new uint256[](2);
        string[] memory symbols = new string[](1);
        vm.expectRevert(FunctionsPriceFeeder.FunctionsPriceFeeder__LengthMismatch.selector);
        feeder.setCommodities(ids, symbols);
    }

    function test_Constructor_Revert_ZeroAddress() public {
        vm.expectRevert(FunctionsPriceFeeder.FunctionsPriceFeeder__InvalidAddress.selector);
        new FunctionsPriceFeeder(address(0), address(d.oracle), address(this));
    }
}
