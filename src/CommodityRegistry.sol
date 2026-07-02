// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title CommodityRegistry
 * @author ChijulyBuilds (AgriBridge Protocol Team)
 * @notice Core system database tracking tokenized agricultural commodity records and lifecycles.
 * @dev This contract acts as both a data registry and approval gateway. The backend engineer
 *      (granted VERIFIER_ROLE) approves/rejects commodities, triggering token minting and collateral flow.
 *      Verification rules and token details are offloaded to separate contracts (SRP).
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
     * @dev Tightly packed into 4 consecutive 32-byte storage slots:
     *      Slot 0: farmer (20 bytes) + status (1 byte) + commodityType (1 byte) + grade (1 byte) = 23 bytes
     *      Slot 1: verifier (20 bytes) + quantity (12 bytes / uint96) = 32 bytes
     *      Slot 2: harvestDate (8 bytes) + registeredAt (8 bytes) + storageEndDate (8 bytes) = 24 bytes
     *      Slot 3: verificationTimestamp (8 bytes) + rejectionReason (32 bytes hash) = 40 bytes (next slot)
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
        uint64 verificationTimestamp;
        bytes32 rejectionReason;
    }

    /*//////////////////////////////////////////////////////////////
                               CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice AccessControl Roles
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant POOL_ROLE = keccak256("POOL_ROLE");
    bytes32 public constant TOKEN_MINTER_ROLE = keccak256("TOKEN_MINTER_ROLE");

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
    error CommodityRegistry__NotCommodityOwner();
    error CommodityRegistry__ApprovalCallFailed();
    error CommodityRegistry__RejectionReasonTooLong();
    error CommodityRegistry__InvalidAddress();
    error CommodityRegistry__TokenAddressNotSet();

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
        address updater,
        uint64 timestamp
    );

    event CommodityApproved(uint256 indexed commodityId, address indexed verifier, uint64 timestamp);

    event CommodityRejected(
        uint256 indexed commodityId, address indexed verifier, bytes32 rejectionReason, uint64 timestamp
    );

    event CommodityCollateralized(uint256 indexed commodityId, address indexed poolAddress, uint64 timestamp);

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Global incremental counter tracking total registered commodities
    uint256 public commodityCount;

    /// @notice Core protocol database lookup mapping unique IDs to structural storage profile records
    mapping(uint256 => Commodity) public commodities;

    /// @notice Global tracking array allowing immediate index lookup of all submissions submitted by a specific farmer
    mapping(address => uint256[]) public farmerCommodityIds;

    /// @notice Mapping to track pending approvals awaiting backend confirmation
    mapping(uint256 => bool) public pendingApprovalConfirmation;

    /// @notice Reference to CommodityToken contract (ERC-1155) for minting
    address public commodityTokenAddress;

    /// @notice Reference to LendingPool contract for collateral management
    address public lendingPoolAddress;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Instantiates database access parameters and default administrators.
     * @param admin The initialization address holding global administrative access configurations
     *  which in this sense is the wallet address of the backed engineer.
     */
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /*//////////////////////////////////////////////////////////////
                       INITIALIZATION FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Set the address of the CommodityToken contract (ERC-1155).
     * @dev Only callable by DEFAULT_ADMIN_ROLE. Should be called once after deployment.
     * @param _tokenAddress Address of the deployed CommodityToken contract.
     */
    function setCommodityTokenAddress(address _tokenAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_tokenAddress != address(0)) {
            revert CommodityRegistry__InvalidAddress();
        }
        commodityTokenAddress = _tokenAddress;
    }

    /**
     * @notice Set the address of the LendingPool contract.
     * @dev Only callable by DEFAULT_ADMIN_ROLE. Should be called once after deployment.
     * @param _poolAddress Address of the deployed LendingPool contract.
     */
    function setLendingPoolAddress(address _poolAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_poolAddress != address(0)) {
            revert CommodityRegistry__InvalidAddress();
        }
        lendingPoolAddress = _poolAddress;
    }

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Registers a new production asset batch profile record directly within the decentralized storage ecosystem.
     * @dev Caller becomes the farmer. Initial status is Pending, awaiting backend verifier approval.
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
            storageEndDate: uint64(block.timestamp) + storageTime,
            verificationTimestamp: 0,
            rejectionReason: bytes32(0)
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

    /*//////////////////////////////////////////////////////////////
                      VERIFICATION/APPROVAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Backend verifier approves a pending commodity, triggering token minting.
     * @dev Only VERIFIER_ROLE can call. Transitions Pending → Verified.
     *      Mints ERC-1155 tokens and prepares for collateral deposit.
     * @param _commodityId The unique item profile reference identifier.
     */
    function approveCommodity(uint256 _commodityId) external whenNotPaused onlyRole(VERIFIER_ROLE) {
        if (_commodityId == 0 || _commodityId > commodityCount) revert CommodityRegistry__CommodityNotFound();

        Commodity storage commodity = commodities[_commodityId];

        // Validate current status is Pending
        if (commodity.status != CommodityStatus.Pending) revert CommodityRegistry__InvalidStatusTransition();

        // Update commodity with verifier details
        commodity.status = CommodityStatus.Verified;
        commodity.verifier = msg.sender;
        commodity.verificationTimestamp = uint64(block.timestamp);
        commodity.rejectionReason = bytes32(0);

        emit CommodityApproved(_commodityId, msg.sender, uint64(block.timestamp));
        emit CommodityStatusUpdated(
            _commodityId, CommodityStatus.Pending, CommodityStatus.Verified, msg.sender, uint64(block.timestamp)
        );

        // Mint ERC-1155 tokens to farmer
        // The backend engineer's wallet must have already called this contract with VERIFIER_ROLE
        // and the token contract must be configured to accept minting from this registry
        _mintCommodityTokens(_commodityId, commodity.farmer, commodity.quantity);
    }

    /**
     * @notice Backend verifier rejects a pending commodity with a reason.
     * @dev Only VERIFIER_ROLE can call. Transitions Pending → Rejected.
     * @param _commodityId The unique item profile reference identifier.
     * @param _rejectionReason The reason for rejection.
     */
    function rejectCommodity(uint256 _commodityId, bytes32 _rejectionReason)
        external
        whenNotPaused
        onlyRole(VERIFIER_ROLE)
    {
        if (_commodityId == 0 || _commodityId > commodityCount) {
            revert CommodityRegistry__CommodityNotFound();
        }

        Commodity storage commodity = commodities[_commodityId];

        // Validate current status is Pending
        if (commodity.status != CommodityStatus.Pending) revert CommodityRegistry__InvalidStatusTransition();

        // Update commodity with rejection details
        commodity.status = CommodityStatus.Rejected;
        commodity.verifier = msg.sender;
        commodity.verificationTimestamp = uint64(block.timestamp);
        commodity.rejectionReason = _rejectionReason;

        emit CommodityRejected(_commodityId, msg.sender, _rejectionReason, uint64(block.timestamp));
        emit CommodityStatusUpdated(
            _commodityId, CommodityStatus.Pending, CommodityStatus.Rejected, msg.sender, uint64(block.timestamp)
        );
    }

    /**
     * @notice Transitions Verified commodity to Collateralized once deposited into lending pool.
     * @dev Only POOL_ROLE (LendingPool contract) can call.
     * @param _commodityId The unique item profile reference identifier.
     */
    function markCollateralized(uint256 _commodityId) external onlyRole(POOL_ROLE) {
        if (_commodityId == 0 || _commodityId > commodityCount) revert CommodityRegistry__CommodityNotFound();

        Commodity storage commodity = commodities[_commodityId];

        // Only Verified items can become Collateralized
        if (commodity.status != CommodityStatus.Verified) revert CommodityRegistry__InvalidStatusTransition();

        commodity.status = CommodityStatus.Collateralized;

        emit CommodityCollateralized(_commodityId, msg.sender, uint64(block.timestamp));
        emit CommodityStatusUpdated(
            _commodityId, CommodityStatus.Verified, CommodityStatus.Collateralized, msg.sender, uint64(block.timestamp)
        );
    }

    /**
     * @notice Generic status update for operational lifecycle changes.
     * @dev Only POOL_ROLE can call. Handles Released, Liquidated, Expired transitions.
     * @param _commodityId The unique item profile reference identifier.
     * @param _newStatus Target state to progress the batch into.
     */
    function updateStatus(uint256 _commodityId, CommodityStatus _newStatus) external whenNotPaused onlyRole(POOL_ROLE) {
        if (_commodityId == 0 || _commodityId > commodityCount) revert CommodityRegistry__CommodityNotFound();

        Commodity storage commodity = commodities[_commodityId];
        CommodityStatus oldStatus = commodity.status;

        // Validate valid transitions for pool operations
        if (
            _newStatus == CommodityStatus.Pending || _newStatus == CommodityStatus.Verified
                || _newStatus == CommodityStatus.Rejected
        ) {
            revert CommodityRegistry__InvalidStatusTransition();
        }

        if (oldStatus == _newStatus) revert CommodityRegistry__InvalidStatusTransition();

        commodity.status = _newStatus;
        emit CommodityStatusUpdated(_commodityId, oldStatus, _newStatus, msg.sender, uint64(block.timestamp));
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

    /**
     * @notice Retrieve full commodity details.
     */
    function getCommodity(uint256 _commodityId) external view returns (Commodity memory) {
        if (_commodityId == 0 || _commodityId > commodityCount) revert CommodityRegistry__CommodityNotFound();
        return commodities[_commodityId];
    }

    /**
     * @notice Get the current status of a commodity.
     */
    function getCommodityStatus(uint256 _commodityId) external view returns (CommodityStatus) {
        if (_commodityId == 0 || _commodityId > commodityCount) revert CommodityRegistry__CommodityNotFound();
        return commodities[_commodityId].status;
    }

    /**
     * @notice Check if a commodity is approved and valid for borrowing.
     */
    function isApprovedForBorrowing(uint256 _commodityId) external view returns (bool) {
        if (_commodityId == 0 || _commodityId > commodityCount) return false;
        Commodity storage commodity = commodities[_commodityId];
        return (commodity.status == CommodityStatus.Verified || commodity.status == CommodityStatus.Collateralized)
            && block.timestamp <= commodity.storageEndDate;
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

    /**
     * @dev Internal helper to mint ERC-1155 tokens when commodity is approved.
     * @param _commodityId The commodity being approved.
     * @param _farmer The farmer who submitted the commodity.
     * @param _quantity The quantity of tokens to mint.
     */
    function _mintCommodityTokens(uint256 _commodityId, address _farmer, uint96 _quantity) internal {
        if (commodityTokenAddress != address(0)) {
            revert CommodityRegistry__TokenAddressNotSet();
        }

        // Call the CommodityToken contract to mint tokens
        // The tokens are minted to the farmer, representing their collateral
        (bool success, bytes memory data) = commodityTokenAddress.call(
            abi.encodeWithSignature("mint(address,uint256,uint256,bytes)", _farmer, _commodityId, _quantity, "")
        );

        if (!success) revert CommodityRegistry__ApprovalCallFailed();
    }
}
