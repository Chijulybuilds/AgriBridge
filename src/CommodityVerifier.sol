// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ICommodityPriceOracle} from "./interfaces/ICommodityPriceOracle.sol";
import {ICommodityToken} from "./interfaces/ICommodityToken.sol";
import "./interfaces/ICommodityRegistry.sol";

/*//////////////////////////////////////////////////////////////
                         MAIN CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title CommodityVerifier
 * @author (ChijulyBuilds) AgriDeFi Protocol Team
 * @notice Validates ecosystem commodities, queries valuations, and orchestrates asset minting workflows.
 */
contract CommodityVerifier is AccessControl, ReentrancyGuard, Pausable {
    /*//////////////////////////////////////////////////////////////
                               CONSTANTS
    //////////////////////////////////////////////////////////////*/

    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    /*//////////////////////////////////////////////////////////////
                            IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    ICommodityRegistry public immutable i_registry;
    ICommodityToken public immutable i_token;
    ICommodityPriceOracle public immutable i_priceOracle;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event VerificationApproved(
        uint256 indexed commodityId,
        address indexed verifier,
        uint256 indexed tokenId,
        uint256 quantity,
        uint256 collateralValueUsd,
        address farmer,
        bytes32 verificationHash,
        uint256 timestamp
    );

    event VerificationRejected(uint256 indexed commodityId, address indexed verifier, string reason, uint256 timestamp);

    event CommodityExpired(uint256 indexed commodityId, uint256 timestamp);

    /*//////////////////////////////////////////////////////////////
                             CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    error CommodityVerifier__InvalidAddress();
    error CommodityVerifier__UnauthorizedVerifier();
    error CommodityVerifier__CommodityNotFound();
    error CommodityVerifier__InvalidCommodityStatus();
    error CommodityVerifier__CommodityExpired();
    error CommodityVerifier__EmptyRejectionReason();
    error CommodityVerifier__InvalidReportHash();

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address _admin, address _registryAddress, address _tokenAddress, address _priceOracleAddress) {
        if (
            _admin == address(0) || _registryAddress == address(0) || _tokenAddress == address(0)
                || _priceOracleAddress == address(0)
        ) {
            revert CommodityVerifier__InvalidAddress();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(VERIFIER_ROLE, _admin); // Initialize admin as default trusted verifier node

        i_registry = ICommodityRegistry(_registryAddress);
        i_token = ICommodityToken(_tokenAddress);
        i_priceOracle = ICommodityPriceOracle(_priceOracleAddress);
    }

    /*//////////////////////////////////////////////////////////////
                        EXTERNAL MUTATIVE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Verify commodity batch profiles, price its net-asset collateral via Oracle, and mint ERC1155 tracking assets.
     * @param commodityId Storage registry identification coordinate.
     * @param inspectionReference Physical warehouse quality analysis index context.
     * @param warehouseReference Unique tracking identifier issued by storage facilities.
     * @param reportHash Cryptographic digest matching offline formal analysis reports.
     */
    function verifyCommodity(
        uint256 commodityId,
        string calldata inspectionReference,
        string calldata warehouseReference,
        bytes32 reportHash
    ) external onlyRole(VERIFIER_ROLE) whenNotPaused nonReentrant {
        if (reportHash == bytes32(0)) revert CommodityVerifier__InvalidReportHash();

        // 1. CHECKS
        DataTypes.Commodity memory commodity = i_registry.getCommodity(commodityId);

        if (commodity.farmer == address(0)) revert CommodityVerifier__CommodityNotFound();
        if (commodity.status != DataTypes.CommodityStatus.PENDING) revert CommodityVerifier__InvalidCommodityStatus();
        if (block.timestamp > commodity.storageEndDate) revert CommodityVerifier__CommodityExpired();
        if (commodity.tokenId != 0) revert CommodityVerifier__InvalidCommodityStatus(); // Defense in depth duplicate token check

        // 2. ORACLE PIPELINE INTEGRATION
        // Fetches asset price using uniform 8-decimal precision layout from the CommodityPriceOracle
        uint256 pricePerKg = i_priceOracle.getPriceFreshData(commodity.commodityType);

        // Collateral Valuation Calculation (Quantity * Price) -> Scaled layout safe for LendingPool calculations
        uint256 collateralValueUsd = commodity.quantity * pricePerKg;

        // 3. INTERACTIONS (Token Minting & Registry Updates)
        // Token contract handles sequential token ID increments natively and returns the calculated index
        uint256 assignedTokenId = i_token.mintCommodity(commodity.farmer, commodity.quantity, "");

        // Mutates global tracking profiles inside the core Registry source-of-truth node
        i_registry.updateCommodityStatus(commodityId, DataTypes.CommodityStatus.VERIFIED);

        // Generate tracking context hash from warehouse inspection values
        bytes32 verificationHash = keccak256(abi.encodePacked(inspectionReference, warehouseReference, reportHash));

        // 4. EMIT EVENTS
        emit VerificationApproved(
            commodityId,
            msg.sender,
            assignedTokenId,
            commodity.quantity,
            collateralValueUsd,
            commodity.farmer,
            verificationHash,
            block.timestamp
        );
    }

    /**
     * @notice Formally flags a requested deposit as invalid, locking downstream protocol actions.
     */
    function rejectCommodity(uint256 commodityId, string calldata reason)
        external
        onlyRole(VERIFIER_ROLE)
        whenNotPaused
        nonReentrant
    {
        if (bytes(reason).length == 0) revert CommodityVerifier__EmptyRejectionReason();

        DataTypes.Commodity memory commodity = i_registry.getCommodity(commodityId);
        if (commodity.farmer == address(0)) revert CommodityVerifier__CommodityNotFound();
        if (commodity.status != DataTypes.CommodityStatus.PENDING) revert CommodityVerifier__InvalidCommodityStatus();

        i_registry.rejectCommodity(commodityId, reason);

        emit VerificationRejected(commodityId, msg.sender, reason, block.timestamp);
    }

    /**
     * @notice Allows an admin or specialized system agent to trigger state transition when storage lifespans end.
     */
    function expireCommodity(uint256 commodityId) external whenNotPaused nonReentrant {
        DataTypes.Commodity memory commodity = i_registry.getCommodity(commodityId);
        if (commodity.farmer == address(0)) revert CommodityVerifier__CommodityNotFound();

        // Enforce timeline validation metrics or role clearance profiles
        if (block.timestamp <= commodity.storageEndDate && !hasRole(VERIFIER_ROLE, msg.sender)) {
            revert CommodityVerifier__UnauthorizedVerifier();
        }

        i_registry.expireCommodity(commodityId);

        emit CommodityExpired(commodityId, block.timestamp);
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN CONTROLS
    //////////////////////////////////////////////////////////////*/

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
