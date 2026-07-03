// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/*//////////////////////////////////////////////////////////////
                         INTERFACES
//////////////////////////////////////////////////////////////*/

/**
 * @notice Minimal interface for CommodityRegistry.
 * @dev Allows CommodityToken to verify commodity existence without circular imports.
 */
interface ICommodityRegistry {
    function getCommodity(uint256 _commodityId)
        external
        view
        returns (
            address farmer,
            uint8 status,
            uint8 commodityType,
            uint8 grade,
            address verifier,
            uint96 quantity,
            uint64 harvestDate,
            uint64 registeredAt,
            uint64 storageEndDate,
            uint64 verificationTimestamp,
            bytes32 rejectionReason
        );
}

/*//////////////////////////////////////////////////////////////
                         MAIN CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title CommodityToken
 * @author ChijulyBuilds (AgriBridge Protocol Team)
 * @notice Standardized ERC1155 representation of verified agricultural commodity tokens.
 * @dev Single responsibility: mint/burn tokens representing collateralized farm commodities.
 *      Token IDs map 1:1 to commodity IDs in CommodityRegistry.
 *      Minting is triggered by backend approval via CommodityRegistry.approveCommodity().
 */
contract CommodityToken is ERC1155, ERC1155Supply, AccessControl, Pausable {
    /*//////////////////////////////////////////////////////////////
                               CONSTANTS
    //////////////////////////////////////////////////////////////*/

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    /// @notice Token identity properties (ERC1155 metadata)
    string public constant name = "AgriBridge Commodity Token";
    string public constant symbol = "ACOMMODITY";

    /*//////////////////////////////////////////////////////////////
                            IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Reference to CommodityRegistry for commodity validation
    ICommodityRegistry public immutable i_registry;

    /// @notice Base URI for token metadata (e.g., IPFS gateway or backend URL)
    string public BaseURI;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event CommodityTokenMinted(uint256 indexed commodityId, address indexed farmer, uint256 quantity, uint64 timestamp);

    event CommodityTokenBurned(uint256 indexed commodityId, address indexed farmer, uint256 quantity, uint64 timestamp);

    /*//////////////////////////////////////////////////////////////
                             CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    error CommodityToken__InvalidAddress();
    error CommodityToken__InvalidQuantity();
    error CommodityToken__TokenAlreadyExists();
    error CommodityToken__CommodityNotFound();
    error CommodityToken__Unauthorized();

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Initializes the CommodityToken contract with registry and metadata references.
     * @dev Called by deployment script (backend service or hardhat/foundry).
     * @param _admin The backend engineer's wallet address (receives DEFAULT_ADMIN_ROLE and BURNER_ROLE).
     * @param _registryAddress The deployed CommodityRegistry contract address.
     * @param _baseURI The base URI for token metadata (set by backend at deployment time).
     *
     * Example baseURI values:
     *   - IPFS: "https://ipfs.io/ipfs/QmXxx/"
     *   - Backend API: "https://api.agribridge.io/metadata/"
     *   - Local: "http://localhost:4000/metadata/"
     */
    constructor(address _admin, address _registryAddress, string memory _baseURI) ERC1155("") {
        if (_admin == address(0) || _registryAddress == address(0)) {
            revert CommodityToken__InvalidAddress();
        }

        // Grant roles to admin (backend engineer's wallet)
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(BURNER_ROLE, _admin);

        // MINTER_ROLE is granted to CommodityRegistry contract only
        // (not to _admin, ensuring all mints flow through verification)
        _grantRole(MINTER_ROLE, _registryAddress);

        i_registry = ICommodityRegistry(_registryAddress);
        BaseURI = _baseURI;
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function setBaseURI(string memory _newURI) external onlyRole(DEFAULT_ADMIN_ROLE) {
        BaseURI = _newURI;
    }

    /**
     * @notice Returns the metadata URI for a given token ID.
     * @dev Token ID = Commodity ID. URI points to JSON metadata hosted externally.
     * @param _tokenId The commodity/token ID.
     * @return Fully constructed metadata URI.
     *
     */
    function uri(uint256 _tokenId) public view override returns (string memory) {
        return string.concat(BaseURI, Strings.toString(_tokenId), ".json");
    }

    /**
     * @notice Check if a token (commodity) has been minted.
     */
    function exists(uint256 _tokenId) public view override returns (bool) {
        return totalSupply(_tokenId) > 0;
    }

    /*//////////////////////////////////////////////////////////////
                        EXTERNAL MUTATIVE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Mints ERC1155 tokens representing verified agricultural commodities.
     * @dev Only callable by MINTER_ROLE (CommodityRegistry contract via approveCommodity).
     *      Token ID = Commodity ID (1:1 mapping).
     *      Tokens are minted to the farmer's address.
     * @param _to Recipient address (farmer who submitted the commodity).
     * @param _commodityId The registry commodity ID (also becomes token ID).
     * @param _amount Quantity of tokens to mint (in base units, 1 = 1 kg).
     *
     * Flow:
     *   1. Backend approves commodity via CommodityRegistry.approveCommodity(commodityId)
     *   2. Registry calls this mint function with MINTER_ROLE
     *   3. Tokens are minted to farmer
     *   4. Farmer can now deposit tokens as collateral to LendingPool
     */
    function mint(address _to, uint256 _commodityId, uint256 _amount) external onlyRole(MINTER_ROLE) whenNotPaused {
        if (_to == address(0)) revert CommodityToken__InvalidAddress();
        if (_amount == 0) revert CommodityToken__InvalidQuantity();
        if (exists(_commodityId)) revert CommodityToken__TokenAlreadyExists();

        // Validate commodity exists in registry
        (address farmer,,,,,,,,,,) = i_registry.getCommodity(_commodityId);
        if (farmer == address(0)) revert CommodityToken__CommodityNotFound();
        if (farmer != _to) revert CommodityToken__Unauthorized();

        // Mint tokens to farmer
        _mint(_to, _commodityId, _amount, "");

        emit CommodityTokenMinted(_commodityId, _to, _amount, uint64(block.timestamp));
    }

    /**
     * @notice Burns ERC1155 tokens during liquidation or settlement.
     * @dev Only callable by BURNER_ROLE (admin/backend engineer).
     *      Called when collateral is sold, loan is repaid, or commodity expires.
     * @param _from Address to burn tokens from.
     * @param _commodityId Token ID to burn.
     * @param _amount Quantity to burn.
     */
    function burn(address _from, uint256 _commodityId, uint256 _amount) external onlyRole(BURNER_ROLE) whenNotPaused {
        if (_amount == 0) revert CommodityToken__InvalidQuantity();

        _burn(_from, _commodityId, _amount);

        emit CommodityTokenBurned(_commodityId, _from, _amount, uint64(block.timestamp));
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Emergency pause all token operations.
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Resume paused token operations.
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
                        INTERNAL HOOK OVERRIDES
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Override ERC1155 update hook to enforce pause state.
     */
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override(ERC1155, ERC1155Supply)
        whenNotPaused
    {
        super._update(from, to, ids, values);
    }

    /**
     * @dev Standard interface support for ERC1155 and AccessControl.
     */
    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
