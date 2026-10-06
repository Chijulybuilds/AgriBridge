// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {CommodityConfig} from "src/CommodityConfig.sol";
import {ICommodityPriceOracle} from "src/interfaces/ICommodityPriceOracle.sol";

/**
 * @title CommodityPriceOracle
 * @author ChijulyBuilds (AgriBridge Protocol Team)
 * @notice USD price per kilogram for each commodity in CommodityConfig, with 8 decimals.
 * @dev Prices are keyed by commodity id, not by lot: valuing a lot (its quantity, grade and basis) is
 *      the lending pool's job. A price older than the heartbeat is stale and cannot back a loan.
 */
contract CommodityPriceOracle is ICommodityPriceOracle, AccessControl, Pausable {
    /*//////////////////////////////////////////////////////////////
                                STRUCTS
    //////////////////////////////////////////////////////////////*/

    /// @dev Packed into one storage slot.
    struct PackedPriceData {
        uint128 answer;
        uint64 updatedAt;
        bool active;
    }

    /*//////////////////////////////////////////////////////////////
                               CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint256 public constant VERSION = 2;
    uint8 public constant override decimals = 8;

    bytes32 public constant PRICE_UPDATER_ROLE = keccak256("PRICE_UPDATER_ROLE");

    uint128 private constant MIN_PRICE = 1 * 10 ** 6; // $0.01
    uint128 private constant MAX_PRICE = 1_000_000 * 10 ** 8; // $1,000,000.00

    /*//////////////////////////////////////////////////////////////
                               IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    CommodityConfig public immutable i_config;
    uint256 public immutable i_heartbeat;

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    mapping(uint256 => PackedPriceData) private s_priceData;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event PriceUpdated(uint256 indexed commodityId, uint256 price, uint256 timestamp, address indexed updater);
    event PriceFeedStatusChanged(uint256 indexed commodityId, bool active);

    /*//////////////////////////////////////////////////////////////
                             CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    error CommodityPriceOracle__InvalidPrice();
    error CommodityPriceOracle__PriceStale();
    error CommodityPriceOracle__PriceFeedInactive();
    error CommodityPriceOracle__ArrayLengthMismatch();
    error CommodityPriceOracle__UnknownCommodity(uint256 commodityId);
    error CommodityPriceOracle__InvalidAddress();

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @param _admin Receives DEFAULT_ADMIN_ROLE and PRICE_UPDATER_ROLE.
     * @param _config Commodity ids a price can be set for.
     * @param _heartbeat Seconds after which a price counts as stale.
     */
    constructor(address _admin, CommodityConfig _config, uint256 _heartbeat) {
        if (_admin == address(0) || address(_config) == address(0)) revert CommodityPriceOracle__InvalidAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(PRICE_UPDATER_ROLE, _admin);
        i_config = _config;
        i_heartbeat = _heartbeat;
    }

    /*//////////////////////////////////////////////////////////////
                        EXTERNAL MUTATIVE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets several commodity prices in one transaction.
    function setPrices(uint256[] calldata _commodityIds, uint128[] calldata _prices)
        external
        onlyRole(PRICE_UPDATER_ROLE)
        whenNotPaused
    {
        uint256 length = _commodityIds.length;
        if (length != _prices.length) revert CommodityPriceOracle__ArrayLengthMismatch();

        for (uint256 i = 0; i < length; i++) {
            _updatePrice(_commodityIds[i], _prices[i]);
        }
    }

    /// @notice Sets one commodity's USD price per kilogram (8 decimals).
    function setPrice(uint256 _commodityId, uint128 _price) external onlyRole(PRICE_UPDATER_ROLE) whenNotPaused {
        _updatePrice(_commodityId, _price);
    }

    /// @notice Switches a commodity's feed off or back on; an inactive feed cannot price anything.
    function setFeedStatus(uint256 _commodityId, bool _active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _requireKnown(_commodityId);
        s_priceData[_commodityId].active = _active;
        emit PriceFeedStatusChanged(_commodityId, _active);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
                             VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Latest price and when it was set, fresh or not.
    function getPrice(uint256 _commodityId) external view returns (uint256 answer, uint256 updatedAt) {
        PackedPriceData memory data = s_priceData[_commodityId];
        if (!data.active) revert CommodityPriceOracle__PriceFeedInactive();
        return (data.answer, data.updatedAt);
    }

    /// @inheritdoc ICommodityPriceOracle
    function getPriceFresh(uint256 _commodityId) external view override returns (uint256 answer) {
        PackedPriceData memory data = s_priceData[_commodityId];
        if (!data.active) revert CommodityPriceOracle__PriceFeedInactive();
        if (block.timestamp - data.updatedAt > i_heartbeat) revert CommodityPriceOracle__PriceStale();
        return data.answer;
    }

    function isFresh(uint256 _commodityId) external view returns (bool) {
        PackedPriceData memory data = s_priceData[_commodityId];
        return data.active && block.timestamp - data.updatedAt <= i_heartbeat;
    }

    /*//////////////////////////////////////////////////////////////
                            INTERNAL HELPERS
    //////////////////////////////////////////////////////////////*/

    function _requireKnown(uint256 _commodityId) internal view {
        if (_commodityId == 0 || _commodityId > i_config.commodityCount()) {
            revert CommodityPriceOracle__UnknownCommodity(_commodityId);
        }
    }

    function _updatePrice(uint256 _commodityId, uint128 _price) internal {
        _requireKnown(_commodityId);
        if (_price < MIN_PRICE || _price > MAX_PRICE) revert CommodityPriceOracle__InvalidPrice();

        PackedPriceData storage data = s_priceData[_commodityId];
        data.answer = _price;
        data.updatedAt = uint64(block.timestamp);
        data.active = true;

        emit PriceUpdated(_commodityId, _price, block.timestamp, msg.sender);
    }
}
