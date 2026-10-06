// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title CommodityConfig
 * @author ChijulyBuilds (AgriBridge Protocol Team)
 * @notice One settings row per commodity (Cocoa, Rice, Maize, ...). Every per-commodity rule in
 *         the protocol reads from here, so adding a crop is a configuration change, not a redeploy.
 * @dev Percentages are basis points (10_000 = 100%). Grade factors give a grade's value as a share
 *      of Grade A. Ages are days along the commodity's decay curve, which starts at Grade A.
 *      Commodity ids start at 1, so 0 always means "unknown".
 */
contract CommodityConfig is AccessControl {
    /*//////////////////////////////////////////////////////////////
                                 TYPES
    //////////////////////////////////////////////////////////////*/

    /// @notice Where a commodity's price comes from.
    /// @dev Global: a world benchmark (e.g. futures), fetched by the oracle feeder.
    ///      Local: no world benchmark, so approved market reporters post it.
    enum PriceSource {
        Global,
        Local
    }

    struct Commodity {
        string name;
        bool active;
        PriceSource priceSource;
        /// @dev Value of Grade B and Grade C as a share of Grade A.
        uint16 gradeBFactorBps;
        uint16 gradeCFactorBps;
        /// @dev Days from Grade A until the lot reaches Grade B, Grade C, and expiry.
        uint16 daysToGradeB;
        uint16 daysToGradeC;
        uint16 daysToExpiry;
        /// @dev Most a loan may be worth against its collateral, and the point it gets liquidated.
        uint16 maxLtvBps;
        uint16 liquidationLtvBps;
        /// @dev Cut from the world price for transport, export and storage (0 for local prices).
        uint16 basisBps;
        /// @dev Storage charge in USDC (6 decimals) per metric ton per 30-day month.
        uint64 storageFeePerTonMonth;
    }

    /*//////////////////////////////////////////////////////////////
                               CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint16 public constant BPS = 10_000;

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Number of commodities ever added; ids run from 1 to commodityCount.
    uint256 public commodityCount;

    mapping(uint256 => Commodity) private s_commodities;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event CommodityAdded(uint256 indexed commodityId, string name);
    event CommodityUpdated(uint256 indexed commodityId);
    event CommodityActiveSet(uint256 indexed commodityId, bool active);

    /*//////////////////////////////////////////////////////////////
                             CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    error CommodityConfig__UnknownCommodity(uint256 commodityId);
    error CommodityConfig__EmptyName();
    error CommodityConfig__InvalidGradeFactors();
    error CommodityConfig__InvalidDecaySchedule();
    error CommodityConfig__InvalidLtv();
    error CommodityConfig__InvalidBasis();

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @param _admin Receives DEFAULT_ADMIN_ROLE: the AgriBridge Safe.
    constructor(address _admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Adds a commodity and returns its id.
     * @param _commodity The settings row; `active` is stored as given.
     */
    function addCommodity(Commodity calldata _commodity)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        returns (uint256 commodityId)
    {
        _validate(_commodity);

        commodityId = ++commodityCount;
        s_commodities[commodityId] = _commodity;

        emit CommodityAdded(commodityId, _commodity.name);
    }

    /**
     * @notice Replaces a commodity's settings.
     * @dev Takes effect immediately, including for open loans against that commodity.
     */
    function updateCommodity(uint256 _commodityId, Commodity calldata _commodity)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _requireKnown(_commodityId);
        _validate(_commodity);

        s_commodities[_commodityId] = _commodity;

        emit CommodityUpdated(_commodityId);
    }

    /// @notice Turns a commodity on or off for new intake without touching its other settings.
    function setCommodityActive(uint256 _commodityId, bool _active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _requireKnown(_commodityId);

        s_commodities[_commodityId].active = _active;

        emit CommodityActiveSet(_commodityId, _active);
    }

    /*//////////////////////////////////////////////////////////////
                             VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function getCommodity(uint256 _commodityId) external view returns (Commodity memory) {
        _requireKnown(_commodityId);
        return s_commodities[_commodityId];
    }

    /// @notice False for unknown ids as well as for commodities switched off.
    function isActive(uint256 _commodityId) external view returns (bool) {
        return _commodityId != 0 && _commodityId <= commodityCount && s_commodities[_commodityId].active;
    }

    /*//////////////////////////////////////////////////////////////
                            INTERNAL HELPERS
    //////////////////////////////////////////////////////////////*/

    function _requireKnown(uint256 _commodityId) internal view {
        if (_commodityId == 0 || _commodityId > commodityCount) {
            revert CommodityConfig__UnknownCommodity(_commodityId);
        }
    }

    /**
     * @dev Rejects settings the rest of the protocol cannot use: value must fall from A to B to C,
     *      the grade dates must come in order, and a loan must hit its liquidation point before it
     *      is worth more than its collateral.
     */
    function _validate(Commodity calldata _commodity) internal pure {
        if (bytes(_commodity.name).length == 0) revert CommodityConfig__EmptyName();

        if (
            _commodity.gradeCFactorBps == 0 || _commodity.gradeCFactorBps > _commodity.gradeBFactorBps
                || _commodity.gradeBFactorBps > BPS
        ) {
            revert CommodityConfig__InvalidGradeFactors();
        }

        if (
            _commodity.daysToGradeB == 0 || _commodity.daysToGradeB >= _commodity.daysToGradeC
                || _commodity.daysToGradeC >= _commodity.daysToExpiry
        ) {
            revert CommodityConfig__InvalidDecaySchedule();
        }

        if (
            _commodity.maxLtvBps == 0 || _commodity.maxLtvBps >= _commodity.liquidationLtvBps
                || _commodity.liquidationLtvBps >= BPS
        ) {
            revert CommodityConfig__InvalidLtv();
        }

        if (_commodity.basisBps >= BPS) revert CommodityConfig__InvalidBasis();
    }
}
