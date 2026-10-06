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
 * @dev Two ways in, decided by the commodity's price source:
 *      - Global (world benchmark): PRICE_UPDATER_ROLE pushes it, in production the Chainlink
 *        Functions feeder, which takes the median of several data providers.
 *      - Local (no world benchmark): approved market reporters each post a price, and it counts once
 *        `localQuorum` fresh reports agree within `localToleranceBps` of their median.
 *      Defences against a bad price: bounds, a staleness limit per commodity, and a move cap. A move
 *      larger than `maxMoveBps` is held until a later update, at least CONFIRMATION_DELAY on, agrees
 *      with it; a one-off glitch therefore never reaches a loan. Pausing the oracle is the circuit
 *      breaker: no fresh price is served, so nothing can borrow or be liquidated on a suspect price.
 *      The admin (the Safe) can set a price directly, past the cap, to correct the feed.
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

    /// @dev A large move waiting for a second update to confirm it.
    struct HeldPrice {
        uint128 price;
        uint64 since;
    }

    struct Report {
        uint128 price;
        uint64 reportedAt;
    }

    /*//////////////////////////////////////////////////////////////
                               CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint256 public constant VERSION = 3;
    uint8 public constant override decimals = 8;

    bytes32 public constant PRICE_UPDATER_ROLE = keccak256("PRICE_UPDATER_ROLE");

    uint16 public constant BPS = 10_000;
    uint256 public constant MAX_REPORTERS = 7;
    /// @notice A held price is confirmed only by an update at least this much later.
    uint256 public constant CONFIRMATION_DELAY = 10 minutes;

    uint128 private constant MIN_PRICE = 1 * 10 ** 6; // $0.01
    uint128 private constant MAX_PRICE = 1_000_000 * 10 ** 8; // $1,000,000.00

    /*//////////////////////////////////////////////////////////////
                               IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    CommodityConfig public immutable i_config;
    /// @notice Default seconds after which a price is stale; `setHeartbeat` overrides it per commodity.
    uint256 public immutable i_heartbeat;

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Largest move from the current price an update can make on its own (10%).
    uint16 public maxMoveBps = 1_000;
    /// @notice Fresh local reports needed to agree on a price.
    uint8 public localQuorum = 2;
    /// @notice How close to the median a local report must be to count as agreeing (5%).
    uint16 public localToleranceBps = 500;

    mapping(uint256 => PackedPriceData) private s_priceData;
    mapping(uint256 => HeldPrice) private s_held;
    mapping(uint256 => uint256) private s_heartbeat;

    address[] private s_reporters;
    mapping(address => bool) public isReporter;
    mapping(uint256 => mapping(address => Report)) private s_reports;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event PriceUpdated(uint256 indexed commodityId, uint256 price, uint256 timestamp, address indexed updater);
    event PriceHeld(uint256 indexed commodityId, uint256 currentPrice, uint256 heldPrice, address indexed updater);
    event PriceFeedStatusChanged(uint256 indexed commodityId, bool active);
    event HeartbeatSet(uint256 indexed commodityId, uint256 heartbeat);
    event LocalPriceReported(uint256 indexed commodityId, address indexed reporter, uint256 price);
    event LocalPriceDisputed(uint256 indexed commodityId, uint256 median, uint256 agreeingReports);
    event ReporterAdded(address indexed reporter);
    event ReporterRemoved(address indexed reporter);
    event RiskParametersSet(uint16 maxMoveBps, uint8 localQuorum, uint16 localToleranceBps);

    /*//////////////////////////////////////////////////////////////
                             CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    error CommodityPriceOracle__InvalidPrice();
    error CommodityPriceOracle__PriceStale();
    error CommodityPriceOracle__PriceFeedInactive();
    error CommodityPriceOracle__ArrayLengthMismatch();
    error CommodityPriceOracle__UnknownCommodity(uint256 commodityId);
    error CommodityPriceOracle__WrongPriceSource(uint256 commodityId);
    error CommodityPriceOracle__InvalidAddress();
    error CommodityPriceOracle__NotReporter();
    error CommodityPriceOracle__ReporterExists();
    error CommodityPriceOracle__TooManyReporters();
    error CommodityPriceOracle__InvalidParameters();

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @param _admin Receives DEFAULT_ADMIN_ROLE and PRICE_UPDATER_ROLE.
     * @param _config Commodity ids and their price sources.
     * @param _heartbeat Default seconds after which a price counts as stale.
     */
    constructor(address _admin, CommodityConfig _config, uint256 _heartbeat) {
        if (_admin == address(0) || address(_config) == address(0)) revert CommodityPriceOracle__InvalidAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(PRICE_UPDATER_ROLE, _admin);
        i_config = _config;
        i_heartbeat = _heartbeat;
    }

    modifier onlyReporter() {
        if (!isReporter[msg.sender]) revert CommodityPriceOracle__NotReporter();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                         WORLD PRICES (UPDATER)
    //////////////////////////////////////////////////////////////*/

    /// @notice Proposes several world prices in one transaction.
    function setPrices(uint256[] calldata _commodityIds, uint128[] calldata _prices)
        external
        onlyRole(PRICE_UPDATER_ROLE)
        whenNotPaused
    {
        uint256 length = _commodityIds.length;
        if (length != _prices.length) revert CommodityPriceOracle__ArrayLengthMismatch();

        for (uint256 i = 0; i < length; i++) {
            _requireSource(_commodityIds[i], CommodityConfig.PriceSource.Global);
            _propose(_commodityIds[i], _prices[i]);
        }
    }

    /// @notice Proposes one world-priced commodity's USD price per kilogram (8 decimals).
    function setPrice(uint256 _commodityId, uint128 _price) external onlyRole(PRICE_UPDATER_ROLE) whenNotPaused {
        _requireSource(_commodityId, CommodityConfig.PriceSource.Global);
        _propose(_commodityId, _price);
    }

    /*//////////////////////////////////////////////////////////////
                        LOCAL PRICES (REPORTERS)
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice An approved reporter posts what a locally priced commodity sells for. The price updates
     *         once `localQuorum` fresh reports agree within `localToleranceBps` of their median.
     */
    function submitLocalPrice(uint256 _commodityId, uint128 _price) external onlyReporter whenNotPaused {
        _requireSource(_commodityId, CommodityConfig.PriceSource.Local);
        _requireBounds(_price);

        s_reports[_commodityId][msg.sender] = Report({price: _price, reportedAt: uint64(block.timestamp)});
        emit LocalPriceReported(_commodityId, msg.sender, _price);

        _tryLocalConsensus(_commodityId);
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets a price directly, past the move cap, to seed or correct a feed. Works while paused.
    function forcePrice(uint256 _commodityId, uint128 _price) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _requireKnown(_commodityId);
        _requireBounds(_price);
        delete s_held[_commodityId];
        _apply(_commodityId, _price);
    }

    /// @notice Switches a commodity's feed off or back on; an inactive feed cannot price anything.
    function setFeedStatus(uint256 _commodityId, bool _active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _requireKnown(_commodityId);
        s_priceData[_commodityId].active = _active;
        emit PriceFeedStatusChanged(_commodityId, _active);
    }

    /// @notice Staleness limit for one commodity, e.g. longer for weekly local prices; 0 restores the default.
    function setHeartbeat(uint256 _commodityId, uint256 _heartbeat) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _requireKnown(_commodityId);
        s_heartbeat[_commodityId] = _heartbeat;
        emit HeartbeatSet(_commodityId, heartbeatOf(_commodityId));
    }

    function setRiskParameters(uint16 _maxMoveBps, uint8 _localQuorum, uint16 _localToleranceBps)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (
            _maxMoveBps == 0 || _maxMoveBps > 5_000 || _localQuorum == 0 || _localQuorum > MAX_REPORTERS
                || _localToleranceBps == 0 || _localToleranceBps > 2_000
        ) {
            revert CommodityPriceOracle__InvalidParameters();
        }
        maxMoveBps = _maxMoveBps;
        localQuorum = _localQuorum;
        localToleranceBps = _localToleranceBps;
        emit RiskParametersSet(_maxMoveBps, _localQuorum, _localToleranceBps);
    }

    function addReporter(address _reporter) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_reporter == address(0)) revert CommodityPriceOracle__InvalidAddress();
        if (isReporter[_reporter]) revert CommodityPriceOracle__ReporterExists();
        if (s_reporters.length >= MAX_REPORTERS) revert CommodityPriceOracle__TooManyReporters();

        s_reporters.push(_reporter);
        isReporter[_reporter] = true;
        emit ReporterAdded(_reporter);
    }

    function removeReporter(address _reporter) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!isReporter[_reporter]) revert CommodityPriceOracle__NotReporter();

        uint256 last = s_reporters.length - 1;
        for (uint256 i = 0; i <= last; i++) {
            if (s_reporters[i] == _reporter) {
                s_reporters[i] = s_reporters[last];
                s_reporters.pop();
                break;
            }
        }
        isReporter[_reporter] = false;
        emit ReporterRemoved(_reporter);
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

    /// @notice Latest price and when it was set, fresh or not, for display.
    function getPrice(uint256 _commodityId) external view returns (uint256 answer, uint256 updatedAt) {
        PackedPriceData memory data = s_priceData[_commodityId];
        if (!data.active) revert CommodityPriceOracle__PriceFeedInactive();
        return (data.answer, data.updatedAt);
    }

    /// @inheritdoc ICommodityPriceOracle
    /// @dev Reverts while the oracle is paused: that is the circuit breaker.
    function getPriceFresh(uint256 _commodityId) external view override whenNotPaused returns (uint256 answer) {
        PackedPriceData memory data = s_priceData[_commodityId];
        if (!data.active) revert CommodityPriceOracle__PriceFeedInactive();
        if (block.timestamp - data.updatedAt > heartbeatOf(_commodityId)) revert CommodityPriceOracle__PriceStale();
        return data.answer;
    }

    function isFresh(uint256 _commodityId) external view returns (bool) {
        PackedPriceData memory data = s_priceData[_commodityId];
        return !paused() && data.active && block.timestamp - data.updatedAt <= heartbeatOf(_commodityId);
    }

    function heartbeatOf(uint256 _commodityId) public view returns (uint256) {
        uint256 custom = s_heartbeat[_commodityId];
        return custom == 0 ? i_heartbeat : custom;
    }

    /// @notice A large move waiting for confirmation, or zeros.
    function heldPrice(uint256 _commodityId) external view returns (uint256 price, uint256 since) {
        HeldPrice memory held = s_held[_commodityId];
        return (held.price, held.since);
    }

    function reporters() external view returns (address[] memory) {
        return s_reporters;
    }

    function getReport(uint256 _commodityId, address _reporter)
        external
        view
        returns (uint256 price, uint256 reportedAt)
    {
        Report memory report = s_reports[_commodityId][_reporter];
        return (report.price, report.reportedAt);
    }

    /*//////////////////////////////////////////////////////////////
                            INTERNAL HELPERS
    //////////////////////////////////////////////////////////////*/

    function _requireKnown(uint256 _commodityId) internal view {
        if (_commodityId == 0 || _commodityId > i_config.commodityCount()) {
            revert CommodityPriceOracle__UnknownCommodity(_commodityId);
        }
    }

    function _requireSource(uint256 _commodityId, CommodityConfig.PriceSource _source) internal view {
        _requireKnown(_commodityId);
        if (i_config.getCommodity(_commodityId).priceSource != _source) {
            revert CommodityPriceOracle__WrongPriceSource(_commodityId);
        }
    }

    function _requireBounds(uint128 _price) internal pure {
        if (_price < MIN_PRICE || _price > MAX_PRICE) revert CommodityPriceOracle__InvalidPrice();
    }

    /// @dev True when `_a` is within `_bps` of `_reference`.
    function _within(uint256 _a, uint256 _reference, uint256 _bps) internal pure returns (bool) {
        uint256 diff = _a > _reference ? _a - _reference : _reference - _a;
        return diff * BPS <= _reference * _bps;
    }

    /**
     * @dev Applies a proposed price when it stays within the move cap of the current one, or when it
     *      confirms a held move (agrees with it, at least CONFIRMATION_DELAY later). Otherwise the
     *      proposal itself is held, replacing any earlier one.
     */
    function _propose(uint256 _commodityId, uint128 _price) internal {
        _requireBounds(_price);
        PackedPriceData memory data = s_priceData[_commodityId];

        if (data.updatedAt == 0 || _within(_price, data.answer, maxMoveBps)) {
            delete s_held[_commodityId];
            _apply(_commodityId, _price);
            return;
        }

        HeldPrice memory held = s_held[_commodityId];
        if (
            held.price != 0 && block.timestamp >= held.since + CONFIRMATION_DELAY
                && _within(_price, held.price, maxMoveBps)
        ) {
            delete s_held[_commodityId];
            _apply(_commodityId, _price);
            return;
        }

        s_held[_commodityId] = HeldPrice({price: _price, since: uint64(block.timestamp)});
        emit PriceHeld(_commodityId, data.answer, _price, msg.sender);
    }

    /// @dev Writes the price. The first price for a commodity also switches its feed on.
    function _apply(uint256 _commodityId, uint128 _price) internal {
        PackedPriceData storage data = s_priceData[_commodityId];
        if (data.updatedAt == 0) data.active = true;
        data.answer = _price;
        data.updatedAt = uint64(block.timestamp);

        emit PriceUpdated(_commodityId, _price, block.timestamp, msg.sender);
    }

    /**
     * @dev Takes the fresh reports for a local commodity, finds their median, and proposes it when
     *      enough of them agree with it. Reporters are few (at most MAX_REPORTERS), so sorting in
     *      place is cheap.
     */
    function _tryLocalConsensus(uint256 _commodityId) internal {
        uint256 window = heartbeatOf(_commodityId);
        uint256 reporterCount = s_reporters.length;
        uint256[] memory fresh = new uint256[](reporterCount);
        uint256 count;

        for (uint256 i = 0; i < reporterCount; i++) {
            Report memory report = s_reports[_commodityId][s_reporters[i]];
            if (report.reportedAt != 0 && block.timestamp - report.reportedAt <= window) fresh[count++] = report.price;
        }
        if (count < localQuorum) return;

        // Insertion sort of the first `count` entries.
        for (uint256 i = 1; i < count; i++) {
            uint256 value = fresh[i];
            uint256 j = i;
            while (j > 0 && fresh[j - 1] > value) {
                fresh[j] = fresh[j - 1];
                j--;
            }
            fresh[j] = value;
        }

        uint256 median = count % 2 == 1 ? fresh[count / 2] : (fresh[count / 2 - 1] + fresh[count / 2]) / 2;

        uint256 agreeing;
        for (uint256 i = 0; i < count; i++) {
            if (_within(fresh[i], median, localToleranceBps)) agreeing++;
        }

        if (agreeing >= localQuorum) {
            // forge-lint: disable-next-line(unsafe-typecast)
            _propose(_commodityId, uint128(median)); // a median of uint128 prices fits in uint128
        } else {
            emit LocalPriceDisputed(_commodityId, median, agreeing);
        }
    }
}
