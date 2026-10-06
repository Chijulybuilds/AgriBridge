// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {CommodityConfig} from "src/CommodityConfig.sol";

/**
 * @title CommodityToken
 * @author ChijulyBuilds (AgriBridge Protocol Team)
 * @notice ERC-1155 claims on stored produce: token id = lot id, one token = one kilogram (18 decimals).
 *         Metadata is built on-chain from the registry, so every token shows its commodity, quantity,
 *         grade, warehouse and inspection evidence without an off-chain server.
 * @dev Only the registry mints, on verified intake. Lots a regulator has frozen cannot move between
 *      users; protocol contracts (PROTOCOL_ROLE) can still hand them back, so a repaid loan or a
 *      cancelled listing returns the tokens to their owner.
 */
contract CommodityToken is ERC1155, ERC1155Supply, AccessControl, Pausable {
    using Strings for uint256;

    /*//////////////////////////////////////////////////////////////
                               CONSTANTS
    //////////////////////////////////////////////////////////////*/

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    /// @notice Held by the contract that burns tokens when their stock leaves the warehouse.
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    /// @notice Protocol contracts (pool, marketplace, custody) that may hand frozen lots back.
    bytes32 public constant PROTOCOL_ROLE = keccak256("PROTOCOL_ROLE");

    string public constant name = "AgriBridge Commodity Token";
    string public constant symbol = "AGRI";

    /*//////////////////////////////////////////////////////////////
                               IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    CommodityRegistry public immutable i_registry;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event CommodityTokenMinted(uint256 indexed lotId, address indexed farmer, uint256 quantity, uint64 timestamp);
    event CommodityTokenBurned(uint256 indexed lotId, address indexed from, uint256 quantity, uint64 timestamp);

    /*//////////////////////////////////////////////////////////////
                             CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    error CommodityToken__InvalidAddress();
    error CommodityToken__InvalidQuantity();
    error CommodityToken__TokenAlreadyExists();
    error CommodityToken__Unauthorized();
    error CommodityToken__LotFrozen(uint256 lotId);

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @param _admin Receives DEFAULT_ADMIN_ROLE.
     * @param _registry The registry, which alone receives MINTER_ROLE so every mint follows verification.
     */
    constructor(address _admin, CommodityRegistry _registry) ERC1155("") {
        if (_admin == address(0) || address(_registry) == address(0)) revert CommodityToken__InvalidAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(MINTER_ROLE, address(_registry));
        i_registry = _registry;
    }

    /*//////////////////////////////////////////////////////////////
                        EXTERNAL MUTATIVE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Mints a verified lot's tokens to the farmer who delivered it.
     * @dev Called by the registry from `approveIntake`; each lot is minted once.
     */
    function mint(address _to, uint256 _lotId, uint256 _amount) external onlyRole(MINTER_ROLE) whenNotPaused {
        if (_to == address(0)) revert CommodityToken__InvalidAddress();
        if (_amount == 0) revert CommodityToken__InvalidQuantity();
        if (exists(_lotId)) revert CommodityToken__TokenAlreadyExists();
        if (i_registry.lotFarmer(_lotId) != _to) revert CommodityToken__Unauthorized();

        _mint(_to, _lotId, _amount, "");

        emit CommodityTokenMinted(_lotId, _to, _amount, uint64(block.timestamp));
    }

    /// @notice Burns tokens whose stock has left the warehouse.
    function burn(address _from, uint256 _lotId, uint256 _amount) external onlyRole(BURNER_ROLE) whenNotPaused {
        if (_amount == 0) revert CommodityToken__InvalidQuantity();

        _burn(_from, _lotId, _amount);

        emit CommodityTokenBurned(_lotId, _from, _amount, uint64(block.timestamp));
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
                                METADATA
    //////////////////////////////////////////////////////////////*/

    /// @notice On-chain JSON metadata for a lot, as a base64 data URI.
    function uri(uint256 _lotId) public view override returns (string memory) {
        return string.concat("data:application/json;base64,", Base64.encode(bytes(_metadata(_lotId))));
    }

    /// @notice The same metadata as plain JSON, for apps that read it directly.
    function tokenMetadata(uint256 _lotId) external view returns (string memory) {
        return _metadata(_lotId);
    }

    function _metadata(uint256 _lotId) internal view returns (string memory) {
        CommodityRegistry.Lot memory lot = i_registry.getLot(_lotId);
        string memory commodity = Strings.escapeJSON(i_registry.i_config().getCommodity(lot.commodityId).name);

        return string.concat(
            '{"name":"Agri-',
            commodity,
            " lot #",
            _lotId.toString(),
            '","description":"A claim on ',
            commodity,
            ' stored and graded by an AgriBridge warehouse. One token is one kilogram.","attributes":[',
            _produceTraits(_lotId, lot, commodity),
            ",",
            _storageTraits(_lotId, lot),
            "]}"
        );
    }

    /// @dev What the lot is: commodity, quantity and grade.
    function _produceTraits(uint256 _lotId, CommodityRegistry.Lot memory _lot, string memory _commodity)
        internal
        view
        returns (string memory)
    {
        return string.concat(
            _trait("Commodity", _commodity),
            ",",
            _trait("Quantity (kg)", (uint256(_lot.measuredKg) / 1e18).toString()),
            ",",
            _trait("Grade at intake", _gradeName(_lot.grade)),
            ",",
            _trait("Current grade", _gradeName(i_registry.currentGrade(_lotId)))
        );
    }

    /// @dev Where and when it was verified, when it expires, and the inspection evidence.
    function _storageTraits(uint256 _lotId, CommodityRegistry.Lot memory _lot) internal view returns (string memory) {
        CommodityRegistry.Warehouse memory warehouse = i_registry.getWarehouse(_lot.warehouseId);
        return string.concat(
            _trait("Warehouse", Strings.escapeJSON(warehouse.name)),
            ",",
            _trait("Region", Strings.escapeJSON(warehouse.region)),
            ",",
            _dateTrait("Verified", _lot.verifiedAt),
            ",",
            _dateTrait("Expires", i_registry.expiresAt(_lotId)),
            ",",
            _trait("Evidence hash", uint256(_lot.evidenceHash).toHexString(32))
        );
    }

    function _trait(string memory _type, string memory _value) internal pure returns (string memory) {
        return string.concat('{"trait_type":"', _type, '","value":"', _value, '"}');
    }

    function _dateTrait(string memory _type, uint64 _timestamp) internal pure returns (string memory) {
        return string.concat(
            '{"trait_type":"', _type, '","display_type":"date","value":', uint256(_timestamp).toString(), "}"
        );
    }

    function _gradeName(CommodityRegistry.Grade _grade) internal pure returns (string memory) {
        if (_grade == CommodityRegistry.Grade.A) return "A";
        if (_grade == CommodityRegistry.Grade.B) return "B";
        return "C";
    }

    /*//////////////////////////////////////////////////////////////
                        INTERNAL HOOK OVERRIDES
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Enforces pause, and stops frozen lots moving between users. Mints and burns are not
     *      transfers, and protocol contracts may still send a frozen lot back to its owner.
     */
    function _update(address _from, address _to, uint256[] memory _ids, uint256[] memory _values)
        internal
        override(ERC1155, ERC1155Supply)
        whenNotPaused
    {
        if (_from != address(0) && _to != address(0) && !hasRole(PROTOCOL_ROLE, _from)) {
            for (uint256 i = 0; i < _ids.length; i++) {
                if (i_registry.isFrozen(_ids[i])) revert CommodityToken__LotFrozen(_ids[i]);
            }
        }
        super._update(_from, _to, _ids, _values);
    }

    function supportsInterface(bytes4 _interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(_interfaceId);
    }
}
