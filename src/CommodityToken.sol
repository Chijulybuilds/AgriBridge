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

interface ICommodityRegistry {
    enum CommodityStatus {
        PENDING,
        VERIFIED,
        REJECTED,
        EXPIRED
    }
    enum CommodityType {
        COCOA,
        RICE,
        MAIZE,
        CASHEW,
        YAM
    }

    struct Commodity {
        address farmer;
        CommodityType commodityType;
        uint256 quantity; // 1 Token Unit = 1 kg of underlying commodity
        uint256 storageEndDate;
        CommodityStatus status;
        uint256 tokenId;
    }

    function getCommodity(uint256 commodityId) external view returns (Commodity memory);
}

/*//////////////////////////////////////////////////////////////
                         MAIN CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title CommodityToken
 * @author AgriDeFi Protocol Team / Senior Engineering Refactor
 * @notice Standardized ERC1155 representation of agricultural asset weights.
 * @dev Single responsibility asset contract. Collateral locking logic is removed here
 *      and handled natively via physical custody transfers to the LendingPool.
 */
contract CommodityToken is ERC1155, ERC1155Supply, AccessControl, Pausable {
    /*//////////////////////////////////////////////////////////////
                               CONSTANTS
    //////////////////////////////////////////////////////////////*/

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    string private BASE_URI;
    /// @notice Token identity properties
    string public constant name = "AgriDeFi Commodity Token";
    string public constant symbol = "ACOMMODITY";

    /*//////////////////////////////////////////////////////////////
                            IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    ICommodityRegistry public immutable i_registry;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event CommodityTokenMinted(
        uint256 indexed tokenId, uint256 indexed commodityId, address indexed farmer, uint256 quantity
    );
    event CommodityTokenBurned(uint256 indexed tokenId, address indexed holder, uint256 quantity);

    /*//////////////////////////////////////////////////////////////
                             CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    error CommodityToken__InvalidAddress();
    error CommodityToken__InvalidQuantity();
    error CommodityToken__TokenAlreadyExists();
    error CommodityToken__CommodityIdMismatch();

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address _admin, address _registryAddress, string memory _baseURI) ERC1155("") {
        if (_admin == address(0) || _registryAddress == address(0)) {
            revert CommodityToken__InvalidAddress();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(MINTER_ROLE, _admin);
        _grantRole(BURNER_ROLE, _admin);

        i_registry = ICommodityRegistry(_registryAddress);
        BASE_URI = _baseURI;
    }

    /*//////////////////////////////////////////////////////////////
                        EXTERNAL MUTATIVE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function uri(uint256 tokenId) public view override returns (string memory) {
        return string.concat(BASE_URI, Strings.toString(tokenId), ".json");
    }

    /**
     * @notice Mints token weights using authoritative commodity configurations as source of truth.
     * @dev Token IDs map 1:1 with their validated Registry Commodity IDs.
     * @param _to Recipient farmer or warehouse custody account.
     * @param _commodityId The verified registry item coordinating this mint execution.
     * @param _amount Quantitative mass assignment (1 token unit = 1 kg).
     * @return tokenId The matching asset ID generated.
     */
    function mintCommodity(address _to, uint256 _commodityId, uint256 _amount)
        external
        onlyRole(MINTER_ROLE)
        whenNotPaused
        returns (uint256 tokenId)
    {
        if (_to == address(0)) revert CommodityToken__InvalidAddress();
        if (_amount == 0) revert CommodityToken__InvalidQuantity();
        if (exists(_commodityId)) revert CommodityToken__TokenAlreadyExists();

        // Cross-verify with registry source of truth to protect token ID boundaries
        ICommodityRegistry.Commodity memory commodity = i_registry.getCommodity(_commodityId);
        if (commodity.farmer != _to) revert CommodityToken__CommodityIdMismatch();

        tokenId = _commodityId;

        _mint(_to, tokenId, _amount, "");

        emit CommodityTokenMinted(tokenId, _commodityId, _to, _amount);
    }

    /**
     * @notice Safe destruction hook used by authorized clearing contracts during physical settlement or liquidation events.
     */
    function burnCommodity(address _from, uint256 _tokenId, uint256 _amount)
        external
        onlyRole(BURNER_ROLE)
        whenNotPaused
    {
        if (_amount == 0) revert CommodityToken__InvalidQuantity();

        _burn(_from, _tokenId, _amount);

        emit CommodityTokenBurned(_tokenId, _from, _amount);
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

    /*//////////////////////////////////////////////////////////////
                        INTERNAL HOOK OVERRIDES
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Consolidated OpenZeppelin v5 transfer execution pipeline control node.
     *      Natively catches and enforces transfers, mints, burns, and circuit breaker actions.
     */
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override(ERC1155, ERC1155Supply)
        whenNotPaused
    {
        super._update(from, to, ids, values);
    }

    /**
     * @dev Standard interface support declaration boilerplate.
     */
    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
