// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title CommodityRegistry
 * @author ChijulyBuilds (AgriBridge Protocol Team)
 * @notice Core system database tracking tokenized agricultural commodity records and lifecycles.
 * @dev This contract acts strictly as a data registry. Verification rules, token details, and pricing
 *      are offloaded to separate contracts to uphold the Single Responsibility Principle.
 */
contract CommodityRegistry is AccessControl, Pausable {
    /*//////////////////////////////////////////////////////////////
                                 ENUMS
    //////////////////////////////////////////////////////////////*/

    enum CommodityType {
        Cocoa,
        Rice,
        Maize,
        Cashew,
        Yam
    }

    enum Grade {
        A,
        B,
        C
    }

    enum CommodityStatus {
        Pending,
        Verified,
        Rejected,
        Collateralized,
        Released,
        Liquidated,
        Expired
    }

    /*//////////////////////////////////////////////////////////////
                                STRUCTS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Struct tracking asset records packed tightly to conserve storage fees.
     * @dev Tightly packed into exactly 3 consecutive 32-byte storage slots:
     *      Slot 0: farmer (20 bytes) + status (1 byte) + commodityType (1 byte) + grade (1 byte) = 23 bytes
     *      Slot 1: verifier (20 bytes) + quantity (12 bytes / uint96) = 32 bytes
     *      Slot 2: harvestDate (8 bytes) + registeredAt (8 bytes) + storageEndDate (8 bytes) = 24 bytes
     */
    struct Commodity {
        address farmer;
        CommodityStatus status;
        CommodityType commodityType;
        Grade grade;
        address verifier;
        uint96 quantity;
        uint64 harvestDate;
        uint64 registeredAt;
        uint64 storageEndDate;
    }

    /*//////////////////////////////////////////////////////////////
                               CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice AccessControl Roles
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant POOL_ROLE = keccak256("POOL_ROLE");

    uint64 private constant MIN_STORAGE_DURATION = 1 days;
    uint64 private constant MAX_STORAGE_DURATION = 730 days;
    uint96 private constant MIN_QUANTITY = 1e18; // 1 base unit with 18 decimals

    /*//////////////////////////////////////////////////////////////
                             CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    error CommodityRegistry__CommodityNotFound();
    error CommodityRegistry__InvalidQuantity();
    error CommodityRegistry__InvalidHarvestDate();
    error CommodityRegistry__InvalidStorageDuration();
    error CommodityRegistry__InvalidMetadataURI();
    error CommodityRegistry__InvalidStatusTransition();

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event CommodityRegistered(
        uint256 indexed commodityId,
        address indexed farmer,
        CommodityType indexed commodityType,
        uint96 quantity,
        Grade grade,
        uint64 harvestDate,
        uint64 storageEndDate
    );

    event CommodityStatusUpdated(
        uint256 indexed commodityId,
        CommodityStatus indexed oldStatus,
        CommodityStatus indexed newStatus,
        address updater
    );

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Global incremental counter tracking total registered commodities
    uint256 public commodityCount;

    /// @notice Core protocol database lookup mapping unique IDs to structural storage profile records
    mapping(uint256 => Commodity) public commodities;

    /// @notice Global tracking array allowing immediate index lookup of all submissions submitted by a specific farmer
    mapping(address => uint256[]) public farmerCommodityIds;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Instantiates database access parameters and default administrators.
     * @param admin The initialization address holding global administrative access configurations.
     */
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Registers a new production asset batch profile record directly within the decentralized storage ecosystem.
     * @param _commodityType Selected commodity type variant value mapped to internal enum parameters.
     * @param _quantity Standard weight mass quantity amount scaled explicitly to 18 decimal point representations.
     * @param _grade Evaluation quality classification standard variant matching structural parameters.
     * @param _harvestDate Chronological epoch boundary check marking when physical crop material extraction completed.
     * @param _storageDurationDays Allocated lifecycle duration timeline metrics tracked inside validation spaces.
     * @return commodityId The newly created unique tracking identifier.
     */
    function registerCommodity(
        CommodityType _commodityType,
        uint96 _quantity,
        Grade _grade,
        uint64 _harvestDate,
        uint64 _storageDurationDays
    ) external whenNotPaused returns (uint256 commodityId) {
        uint64 storageTime = _storageDurationDays * 1 days;
        _validateCommodity(_quantity, _harvestDate, storageTime);

        unchecked {
            commodityId = ++commodityCount;
        }

        commodities[commodityId] = Commodity({
            farmer: msg.sender,
            status: CommodityStatus.Pending,
            commodityType: _commodityType,
            grade: _grade,
            verifier: address(0),
            quantity: _quantity,
            harvestDate: _harvestDate,
            registeredAt: uint64(block.timestamp),
            storageEndDate: uint64(block.timestamp) + storageTime
        });
        farmerCommodityIds[msg.sender].push(commodityId);

        emit CommodityRegistered(
            commodityId,
            msg.sender,
            _commodityType,
            _quantity,
            _grade,
            _harvestDate,
            uint64(block.timestamp) + storageTime
        );
    }

    /**
     * @notice Processes authoritative updates targeting status metrics. Restricted strictly to verified network actor modules.
     * @param _commodityId The unique item profile reference identifier.
     * @param _newStatus Target state to progress the batch into.
     */
    function updateStatus(uint256 _commodityId, CommodityStatus _newStatus) external whenNotPaused {
        if (_commodityId == 0 || _commodityId > commodityCount) revert CommodityRegistry__CommodityNotFound();

        Commodity storage commodity = commodities[_commodityId];
        CommodityStatus oldStatus = commodity.status;

        if (oldStatus == _newStatus) revert CommodityRegistry__InvalidStatusTransition();

        // Verifiers only approve or reject pending items
        if (_newStatus == CommodityStatus.Verified || _newStatus == CommodityStatus.Rejected) {
            _checkRole(VERIFIER_ROLE, msg.sender);
            if (oldStatus != CommodityStatus.Pending) revert CommodityRegistry__InvalidStatusTransition();
            commodity.verifier = msg.sender;
        } else {
            // Financial pool entities control operational lifecycle changes (Collateralized, Liquidated, Released)
            _checkRole(POOL_ROLE, msg.sender);
        }

        commodity.status = _newStatus;
        emit CommodityStatusUpdated(_commodityId, oldStatus, _newStatus, msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
                             VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Utility reading active operational data validity based on status and chronological timeline.
     */
    function isCommodityValid(uint256 _commodityId) external view returns (bool) {
        if (_commodityId == 0 || _commodityId > commodityCount) return false;
        Commodity storage commodity = commodities[_commodityId];
        return (commodity.status == CommodityStatus.Verified && block.timestamp <= commodity.storageEndDate);
    }

    /**
     * @notice Helper returning entire data array elements mapping out a given producer's history.
     */
    function getFarmerCommodityIds(address _farmer) external view returns (uint256[] memory) {
        return farmerCommodityIds[_farmer];
    }

    /*//////////////////////////////////////////////////////////////
                            INTERNAL HELPERS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Compact consolidated validation helper enforcing processing boundaries while minimizing jumps.
     */
    function _validateCommodity(uint96 _quantity, uint64 _harvestDate, uint64 _storageTime) internal view {
        // Solidity automatically validates that _commodityType matches the enum definition

        if (_quantity < MIN_QUANTITY) revert CommodityRegistry__InvalidQuantity();
        if (_harvestDate > block.timestamp) revert CommodityRegistry__InvalidHarvestDate();
        if (_storageTime < MIN_STORAGE_DURATION || _storageTime > MAX_STORAGE_DURATION) {
            revert CommodityRegistry__InvalidStorageDuration();
        }
    }
}
