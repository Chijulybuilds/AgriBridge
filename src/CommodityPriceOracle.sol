// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {DataTypes} from "./interfaces/ICommodityRegistry.sol";
import {ICommodityPriceOracle} from "./interfaces/ICommodityPriceOracle.sol";

/**
 * @title CommodityPriceOracle
 * @author ChijulyBuilds (AgriDeFi Protocol Team)
 * @notice Maintains robust, low-gas asset valuations across the decentralized system ecosystem.
 * @dev Reordered and packed according to professional DeFi optimization conventions. Fully layout-compatible
 *      with future Chainlink aggregators.
 */
contract CommodityPriceOracle is
    ICommodityPriceOracle,
    AccessControl,
    Pausable
{
    /*//////////////////////////////////////////////////////////////
                                STRUCTS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Tightly packed into exactly 1 storage slot (32 bytes):
     *      - answer: uint128 (~340 undecillion maximum price space)
     *      - updatedAt: uint64 (Unix timestamp capability past year 2500)
     *      - active: bool (1 byte)
     */
    struct PackedPriceData {
        uint128 answer;
        uint64 updatedAt;
        bool active;
    }

    /*//////////////////////////////////////////////////////////////
                               CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint256 public constant override VERSION = 1;
    uint8 public constant override decimals = 8;

    bytes32 public constant PRICE_UPDATER_ROLE =
        keccak256("PRICE_UPDATER_ROLE");

    /// @dev Uniform evaluation bounds across asset parameters using standard 8-decimal precision layout
    uint128 private constant MIN_PRICE_PER_UNIT_COMMODITY = 1 * 10 ** 6; // $0.01
    uint128 private constant MAX_PRICE_PER_UNIT_COMMODITY = 1_000_000 * 10 ** 8; // $1,000,000.00

    /*//////////////////////////////////////////////////////////////
                            IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    uint256 public immutable i_heartbeat;

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @dev Private storage mapping to prevent unchecked outside state changes. Wrapped in clean getters.
    mapping(CommodityType => PackedPriceData) private s_priceData;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event PriceUpdated(
        CommodityType indexed commodity,
        uint256 indexed newPrice,
        uint256 timestamp,
        address indexed updater
    );
    event PriceFeedStatusChanged(
        CommodityType indexed commodity,
        bool indexed status
    );

    /*//////////////////////////////////////////////////////////////
                             CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    error CommodityPriceOracle__InvalidPrice();
    error CommodityPriceOracle__PriceStale();
    error CommodityPriceOracle__InvalidTimestamp();
    error CommodityPriceOracle__PriceFeedInactive();
    error CommodityPriceOracle__ArrayLengthMismatch();

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @param _admin Complete systems controller address.
     * @param _heartbeat Chronological ceiling metric mapping freshness requirements.
     */
    constructor(address _admin, uint256 _heartbeat) {
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(PRICE_UPDATER_ROLE, _admin);
        i_heartbeat = _heartbeat;
    }

    /*//////////////////////////////////////////////////////////////
                        EXTERNAL MUTATIVE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice The set Prices for commodities are set after deployment just before product goes public
     */

    /**
     * @notice Allows centralized array batches to push valuations to the engine in a single transaction.
     * @param _commodities Fixed enum asset designations matching protocol indexing guidelines.
     * @param _prices Normalized prices scaling directly into 8 decimal layouts.
     */
    function setPrices(
        CommodityType[] calldata _commodities,
        uint128[] calldata _prices
    ) external onlyRole(PRICE_UPDATER_ROLE) whenNotPaused {
        uint256 length = _commodities.length;
        if (length != _prices.length)
            revert CommodityPriceOracle__ArrayLengthMismatch();

        for (uint256 i = 0; i < length; ) {
            _updatePriceInternal(_commodities[i], _prices[i]);
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Updates the pricing metric configuration tracking profile for a specific individual asset.
     */
    function setPrice(
        CommodityType _commodity,
        uint128 _newPrice
    ) external onlyRole(PRICE_UPDATER_ROLE) whenNotPaused {
        _updatePriceInternal(_commodity, _newPrice);
    }

    /**
     * @notice Lazy initialization function to initialize data feeds without hardcoding static values inside constructors.
     */
    function initializeCommodity(
        CommodityType _commodity,
        uint128 _initialPrice
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _updatePriceInternal(_commodity, _initialPrice);
    }

    /**
     * @notice Toggles active status configurations on specific tracking paths.
     */
    function setFeedStatus(
        CommodityType _commodity,
        bool _active
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        s_priceData[_commodity].active = _active;
        emit PriceFeedStatusChanged(_commodity, _active);
    }

    /*//////////////////////////////////////////////////////////////
                            EXTERNAL VIEWS
    //////////////////////////////////////////////////////////////*/

    function getPrice(
        CommodityType _commodity
    ) external view override returns (uint256 answer, uint256 updatedAt) {
        PackedPriceData memory data = s_priceData[_commodity];
        if (!data.active) revert CommodityPriceOracle__PriceFeedInactive();
        return (data.answer, data.updatedAt);
    }

    function getPriceFresh(
        CommodityType _commodity
    ) external view override returns (uint256 answer) {
        PackedPriceData memory data = s_priceData[_commodity];
        if (!data.active) revert CommodityPriceOracle__PriceFeedInactive();
        if (block.timestamp - data.updatedAt > i_heartbeat)
            revert CommodityPriceOracle__PriceStale();
        return data.answer;
    }

    function isFresh(
        CommodityType _commodity
    ) external view override returns (bool) {
        PackedPriceData memory data = s_priceData[_commodity];
        if (!data.active) return false;
        return (block.timestamp - data.updatedAt <= i_heartbeat);
    }

    function getPriceFreshData(
        DataTypes.CommodityType commodity
    ) external view override returns (uint256 answer) {
        CommodityType priceCommodity = CommodityType(uint8(commodity));
        PackedPriceData memory data = s_priceData[priceCommodity];
        if (!data.active) revert CommodityPriceOracle__PriceFeedInactive();
        if (block.timestamp - data.updatedAt > i_heartbeat)
            revert CommodityPriceOracle__PriceStale();
        return data.answer;
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
                            INTERNAL HELPERS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Core processing node writing mutations directly to storage. Employs structural storage pointer assignments.
     */
    function _updatePriceInternal(
        CommodityType _commodity,
        uint128 _newPrice
    ) internal {
        if (
            _newPrice < MIN_PRICE_PER_UNIT_COMMODITY ||
            _newPrice > MAX_PRICE_PER_UNIT_COMMODITY
        ) {
            revert CommodityPriceOracle__InvalidPrice();
        }

        PackedPriceData storage data = s_priceData[_commodity];
        if (block.timestamp < data.updatedAt)
            revert CommodityPriceOracle__InvalidTimestamp();

        data.answer = _newPrice;
        data.updatedAt = uint64(block.timestamp);
        data.active = true;

        emit PriceUpdated(_commodity, _newPrice, block.timestamp, msg.sender);
    }
}
