// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_3_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import {
    AutomationCompatibleInterface
} from "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";

/// @notice The oracle surface the feeder writes to (it needs PRICE_UPDATER_ROLE there).
interface IWorldPriceOracle {
    function setPrice(uint256 _commodityId, uint128 _price) external;
}

/**
 * @title FunctionsPriceFeeder
 * @author ChijulyBuilds (AgriBridge Protocol Team)
 * @notice Brings world commodity prices on-chain through Chainlink Functions. A decentralized oracle
 *         network runs `source` (JavaScript that queries several price providers and takes the median),
 *         and this contract writes the result to CommodityPriceOracle, one commodity at a time.
 * @dev The JavaScript returns an ABI-encoded uint256[] of USD per kilogram with 8 decimals, in the
 *      order of `commodityIds()`; see scripts/functions/commodity-prices.js. The oracle still applies
 *      its own bounds and move cap to every price. Fulfilment never reverts on bad data (a revert
 *      would still cost LINK); it records what went wrong in events instead.
 *      Chainlink Automation can call `performUpkeep` on a timer; anyone else may call `requestPrices`
 *      too, no more often than `minRequestInterval`, since each request spends subscription LINK.
 */
contract FunctionsPriceFeeder is FunctionsClient, AutomationCompatibleInterface, AccessControl {
    using FunctionsRequest for FunctionsRequest.Request;

    /*//////////////////////////////////////////////////////////////
                                 TYPES
    //////////////////////////////////////////////////////////////*/

    struct Settings {
        /// @dev Chainlink Functions network and the subscription that pays for requests.
        bytes32 donId;
        uint64 subscriptionId;
        uint32 callbackGasLimit;
        /// @dev DON-hosted secrets holding the providers' API keys; version 0 means none.
        uint8 secretsSlotId;
        uint64 secretsVersion;
        /// @dev Minimum seconds between requests.
        uint256 minRequestInterval;
    }

    /*//////////////////////////////////////////////////////////////
                                 STATE
    //////////////////////////////////////////////////////////////*/

    IWorldPriceOracle public immutable i_oracle;

    Settings public settings;
    /// @notice JavaScript the oracle network runs.
    string public source;

    uint256[] private s_commodityIds;
    /// @dev Provider symbols passed to the JavaScript as args, aligned with `s_commodityIds`.
    string[] private s_symbols;

    uint256 public lastRequestAt;
    bytes32 public lastRequestId;
    bytes public lastError;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event SettingsUpdated(bytes32 donId, uint64 subscriptionId, uint32 callbackGasLimit, uint256 minRequestInterval);
    event SourceUpdated(bytes32 sourceHash);
    event CommoditiesUpdated(uint256[] commodityIds, string[] symbols);
    event PricesRequested(bytes32 indexed requestId);
    event PriceDelivered(bytes32 indexed requestId, uint256 indexed commodityId, uint256 price);
    event PriceRejected(bytes32 indexed requestId, uint256 indexed commodityId, uint256 price, bytes reason);
    event RequestFailed(bytes32 indexed requestId, bytes reason);
    event UnexpectedResponse(bytes32 indexed requestId);

    /*//////////////////////////////////////////////////////////////
                             CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    error FunctionsPriceFeeder__InvalidAddress();
    error FunctionsPriceFeeder__NotConfigured();
    error FunctionsPriceFeeder__TooSoon();
    error FunctionsPriceFeeder__LengthMismatch();

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @param _router Chainlink Functions router on this network.
     * @param _oracle CommodityPriceOracle, where this contract must hold PRICE_UPDATER_ROLE.
     * @param _admin Receives DEFAULT_ADMIN_ROLE: the AgriBridge Safe.
     */
    constructor(address _router, address _oracle, address _admin) FunctionsClient(_router) {
        if (_router == address(0) || _oracle == address(0) || _admin == address(0)) {
            revert FunctionsPriceFeeder__InvalidAddress();
        }
        i_oracle = IWorldPriceOracle(_oracle);
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function setSettings(Settings calldata _settings) external onlyRole(DEFAULT_ADMIN_ROLE) {
        settings = _settings;
        emit SettingsUpdated(
            _settings.donId, _settings.subscriptionId, _settings.callbackGasLimit, _settings.minRequestInterval
        );
    }

    function setSource(string calldata _source) external onlyRole(DEFAULT_ADMIN_ROLE) {
        source = _source;
        emit SourceUpdated(keccak256(bytes(_source)));
    }

    /// @notice World-priced commodities to fetch, and the symbol the JavaScript looks each one up by.
    function setCommodities(uint256[] calldata _commodityIds, string[] calldata _symbols)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (_commodityIds.length != _symbols.length) revert FunctionsPriceFeeder__LengthMismatch();
        s_commodityIds = _commodityIds;
        delete s_symbols;
        for (uint256 i = 0; i < _symbols.length; i++) {
            s_symbols.push(_symbols[i]);
        }
        emit CommoditiesUpdated(_commodityIds, _symbols);
    }

    /*//////////////////////////////////////////////////////////////
                               REQUESTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Asks the oracle network for fresh prices of every configured commodity.
    function requestPrices() public returns (bytes32 requestId) {
        if (!_configured()) revert FunctionsPriceFeeder__NotConfigured();
        if (block.timestamp < lastRequestAt + settings.minRequestInterval) revert FunctionsPriceFeeder__TooSoon();

        FunctionsRequest.Request memory request;
        request.initializeRequestForInlineJavaScript(source);
        request.setArgs(s_symbols);
        if (settings.secretsVersion != 0) request.addDONHostedSecrets(settings.secretsSlotId, settings.secretsVersion);

        lastRequestAt = block.timestamp;
        requestId =
            _sendRequest(request.encodeCBOR(), settings.subscriptionId, settings.callbackGasLimit, settings.donId);
        lastRequestId = requestId;

        emit PricesRequested(requestId);
    }

    /// @inheritdoc AutomationCompatibleInterface
    function checkUpkeep(bytes calldata) external view override returns (bool upkeepNeeded, bytes memory) {
        upkeepNeeded = _configured() && block.timestamp >= lastRequestAt + settings.minRequestInterval;
        return (upkeepNeeded, "");
    }

    /// @inheritdoc AutomationCompatibleInterface
    function performUpkeep(bytes calldata) external override {
        requestPrices();
    }

    /*//////////////////////////////////////////////////////////////
                              FULFILMENT
    //////////////////////////////////////////////////////////////*/

    /// @dev Delivers each price to the oracle; a price the oracle refuses does not block the others.
    function _fulfillRequest(bytes32 _requestId, bytes memory _response, bytes memory _err) internal override {
        if (_requestId != lastRequestId) {
            emit UnexpectedResponse(_requestId);
            return;
        }
        if (_err.length > 0) {
            lastError = _err;
            emit RequestFailed(_requestId, _err);
            return;
        }

        uint256[] memory prices;
        try this.decodePrices(_response) returns (uint256[] memory decoded) {
            prices = decoded;
        } catch {
            emit UnexpectedResponse(_requestId);
            return;
        }
        if (prices.length != s_commodityIds.length) {
            emit UnexpectedResponse(_requestId);
            return;
        }

        for (uint256 i = 0; i < prices.length; i++) {
            uint256 commodityId = s_commodityIds[i];
            if (prices[i] > type(uint128).max) {
                emit PriceRejected(_requestId, commodityId, prices[i], "");
                continue;
            }
            // forge-lint: disable-next-line(unsafe-typecast)
            try i_oracle.setPrice(commodityId, uint128(prices[i])) {
                emit PriceDelivered(_requestId, commodityId, prices[i]);
            } catch (bytes memory reason) {
                emit PriceRejected(_requestId, commodityId, prices[i], reason);
            }
        }
    }

    /// @notice Decodes a response; external so fulfilment can catch malformed data.
    function decodePrices(bytes calldata _response) external pure returns (uint256[] memory) {
        return abi.decode(_response, (uint256[]));
    }

    /*//////////////////////////////////////////////////////////////
                                 VIEWS
    //////////////////////////////////////////////////////////////*/

    function commodityIds() external view returns (uint256[] memory) {
        return s_commodityIds;
    }

    function symbols() external view returns (string[] memory) {
        return s_symbols;
    }

    function _configured() internal view returns (bool) {
        return bytes(source).length != 0 && s_commodityIds.length != 0 && settings.subscriptionId != 0;
    }
}
