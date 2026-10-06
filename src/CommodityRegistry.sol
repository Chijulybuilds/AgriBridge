// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {CommodityConfig} from "src/CommodityConfig.sol";

/**
 * @notice Minting surface of CommodityToken, as the registry uses it.
 * @dev A typed interface rather than a low-level call, so the compiler checks the signature.
 */
interface ICommodityTokenMinter {
    function mint(address _to, uint256 _lotId, uint256 _amount) external;
}

/**
 * @title CommodityRegistry
 * @author ChijulyBuilds (AgriBridge Protocol Team)
 * @notice Records every lot of produce a warehouse takes in: the farmer's intake request, then the
 *         verifier's measured weight, grade and inspection evidence. Approval mints the lot's tokens
 *         to the farmer, one token per kilogram (18 decimals); the token id is the lot id.
 * @dev The verifier is a single wallet, the AgriBridge Safe: VERIFIER_ROLE can have only one holder
 *      at a time. A lot's current grade and its expiry follow its commodity's decay schedule in
 *      CommodityConfig, starting from the grade the verifier gave it at intake. A regulator can
 *      freeze a lot or a whole warehouse, which stops its tokens from moving between users.
 */
contract CommodityRegistry is AccessControl, Pausable {
    /*//////////////////////////////////////////////////////////////
                                 TYPES
    //////////////////////////////////////////////////////////////*/

    enum Grade {
        A,
        B,
        C
    }

    enum LotStatus {
        Pending,
        Verified,
        Rejected,
        Cancelled
    }

    struct Lot {
        address farmer;
        LotStatus status;
        /// @dev Grade the verifier gave the lot at intake; `currentGrade` ages it.
        Grade grade;
        bool frozen;
        uint32 commodityId;
        uint32 warehouseId;
        /// @dev Farmer's estimate when requesting intake, then the verifier's measurement (18 decimals).
        uint96 estimatedKg;
        uint96 measuredKg;
        uint64 harvestDate;
        uint64 requestedAt;
        /// @dev Intake time: the decay clock starts here.
        uint64 verifiedAt;
        address verifier;
        /// @dev keccak-256 of the signed inspection report, which is stored off-chain.
        bytes32 evidenceHash;
        bytes32 rejectionReason;
    }

    struct Warehouse {
        string name;
        string region;
        uint96 capacityKg;
        /// @dev Kilograms of verified produce currently held there.
        uint96 storedKg;
        bool active;
        bool frozen;
    }

    /*//////////////////////////////////////////////////////////////
                               CONSTANTS
    //////////////////////////////////////////////////////////////*/

    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");
    /// @notice Held by the contract that releases stock to token holders who withdraw it.
    bytes32 public constant CUSTODY_ROLE = keccak256("CUSTODY_ROLE");

    uint96 private constant MIN_QUANTITY = 1e18; // 1 kg
    uint256 private constant BPS = 10_000;

    /*//////////////////////////////////////////////////////////////
                               IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    CommodityConfig public immutable i_config;

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice CommodityToken (ERC-1155) that approval mints.
    address public commodityToken;

    /// @notice The one wallet holding VERIFIER_ROLE, or zero when none does.
    address public verifier;

    uint256 public lotCount;
    mapping(uint256 => Lot) private s_lots;
    mapping(address => uint256[]) private s_farmerLots;

    uint256 public warehouseCount;
    mapping(uint256 => Warehouse) private s_warehouses;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event IntakeRequested(
        uint256 indexed lotId,
        address indexed farmer,
        uint256 indexed commodityId,
        uint256 warehouseId,
        uint96 estimatedKg,
        uint64 harvestDate
    );
    event IntakeApproved(
        uint256 indexed lotId, address indexed verifier, uint96 measuredKg, Grade grade, bytes32 evidenceHash
    );
    event IntakeRejected(uint256 indexed lotId, address indexed verifier, bytes32 reason);
    event IntakeCancelled(uint256 indexed lotId);
    event LotFrozen(uint256 indexed lotId, bool frozen);
    event StockReleased(uint256 indexed lotId, uint96 kg);
    event WarehouseAdded(uint256 indexed warehouseId, string name, string region, uint96 capacityKg);
    event WarehouseUpdated(uint256 indexed warehouseId);
    event WarehouseFrozen(uint256 indexed warehouseId, bool frozen);

    /*//////////////////////////////////////////////////////////////
                             CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    error CommodityRegistry__LotNotFound(uint256 lotId);
    error CommodityRegistry__WarehouseNotFound(uint256 warehouseId);
    error CommodityRegistry__WarehouseUnavailable(uint256 warehouseId);
    error CommodityRegistry__CommodityNotActive(uint256 commodityId);
    error CommodityRegistry__InvalidQuantity();
    error CommodityRegistry__InvalidHarvestDate();
    error CommodityRegistry__InvalidStatus();
    error CommodityRegistry__NotLotFarmer();
    error CommodityRegistry__MissingEvidence();
    error CommodityRegistry__OverCapacity(uint256 warehouseId);
    error CommodityRegistry__EmptyName();
    error CommodityRegistry__InvalidAddress();
    error CommodityRegistry__TokenAddressNotSet();
    error CommodityRegistry__MintFailed();
    error CommodityRegistry__VerifierAlreadySet(address current);

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @param _admin Receives DEFAULT_ADMIN_ROLE: the AgriBridge Safe, or the deployer until handover.
     * @param _config Per-commodity settings that intake and decay read.
     */
    constructor(address _admin, CommodityConfig _config) {
        if (_admin == address(0) || address(_config) == address(0)) revert CommodityRegistry__InvalidAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        i_config = _config;
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function setCommodityTokenAddress(address _tokenAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_tokenAddress == address(0)) revert CommodityRegistry__InvalidAddress();
        commodityToken = _tokenAddress;
    }

    /// @notice Registers a verifier station that can take in produce.
    function addWarehouse(string calldata _name, string calldata _region, uint96 _capacityKg)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        returns (uint256 warehouseId)
    {
        if (bytes(_name).length == 0) revert CommodityRegistry__EmptyName();
        if (_capacityKg == 0) revert CommodityRegistry__InvalidQuantity();

        warehouseId = ++warehouseCount;
        Warehouse storage warehouse = s_warehouses[warehouseId];
        warehouse.name = _name;
        warehouse.region = _region;
        warehouse.capacityKg = _capacityKg;
        warehouse.active = true;

        emit WarehouseAdded(warehouseId, _name, _region, _capacityKg);
    }

    /// @notice Edits a warehouse; an inactive one takes no new intake but keeps the stock it holds.
    function updateWarehouse(
        uint256 _warehouseId,
        string calldata _name,
        string calldata _region,
        uint96 _capacityKg,
        bool _active
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Warehouse storage warehouse = _warehouse(_warehouseId);
        if (bytes(_name).length == 0) revert CommodityRegistry__EmptyName();
        if (_capacityKg == 0) revert CommodityRegistry__InvalidQuantity();

        warehouse.name = _name;
        warehouse.region = _region;
        warehouse.capacityKg = _capacityKg;
        warehouse.active = _active;

        emit WarehouseUpdated(_warehouseId);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
                                 INTAKE
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice A farmer asks a warehouse to take in a lot of produce.
     * @param _commodityId CommodityConfig id of the crop.
     * @param _estimatedKg The farmer's estimate, 18 decimals; the verifier weighs the real amount.
     * @param _warehouseId Station the produce is delivered to.
     * @param _harvestDate Unix time the crop was harvested; cannot be in the future.
     */
    function requestIntake(uint256 _commodityId, uint96 _estimatedKg, uint256 _warehouseId, uint64 _harvestDate)
        external
        whenNotPaused
        returns (uint256 lotId)
    {
        if (!i_config.isActive(_commodityId)) revert CommodityRegistry__CommodityNotActive(_commodityId);
        _requireWarehouseOpen(_warehouseId);
        if (_estimatedKg < MIN_QUANTITY) revert CommodityRegistry__InvalidQuantity();
        if (_harvestDate == 0 || _harvestDate > block.timestamp) revert CommodityRegistry__InvalidHarvestDate();

        lotId = ++lotCount;
        Lot storage lot = s_lots[lotId];
        lot.farmer = msg.sender;
        lot.status = LotStatus.Pending;
        // Both ids were just checked against their registries, which never approach 2^32 entries.
        // forge-lint: disable-next-line(unsafe-typecast)
        lot.commodityId = uint32(_commodityId);
        // forge-lint: disable-next-line(unsafe-typecast)
        lot.warehouseId = uint32(_warehouseId);
        lot.estimatedKg = _estimatedKg;
        lot.harvestDate = _harvestDate;
        lot.requestedAt = uint64(block.timestamp);
        s_farmerLots[msg.sender].push(lotId);

        emit IntakeRequested(lotId, msg.sender, _commodityId, _warehouseId, _estimatedKg, _harvestDate);
    }

    /// @notice The farmer withdraws a request the verifier has not acted on yet.
    function cancelIntake(uint256 _lotId) external {
        Lot storage lot = _lot(_lotId);
        if (lot.farmer != msg.sender) revert CommodityRegistry__NotLotFarmer();
        if (lot.status != LotStatus.Pending) revert CommodityRegistry__InvalidStatus();

        lot.status = LotStatus.Cancelled;

        emit IntakeCancelled(_lotId);
    }

    /**
     * @notice The verifier records what the warehouse actually received and mints the lot's tokens.
     * @param _lotId Pending lot.
     * @param _measuredKg Weight on the warehouse scale, 18 decimals; this many tokens are minted.
     * @param _grade Quality at intake; the decay clock starts from this grade.
     * @param _evidenceHash keccak-256 of the signed inspection report.
     */
    function approveIntake(uint256 _lotId, uint96 _measuredKg, Grade _grade, bytes32 _evidenceHash)
        external
        whenNotPaused
        onlyRole(VERIFIER_ROLE)
    {
        Lot storage lot = _lot(_lotId);
        if (lot.status != LotStatus.Pending) revert CommodityRegistry__InvalidStatus();
        if (_measuredKg < MIN_QUANTITY) revert CommodityRegistry__InvalidQuantity();
        if (_evidenceHash == bytes32(0)) revert CommodityRegistry__MissingEvidence();

        _requireWarehouseOpen(lot.warehouseId);
        Warehouse storage warehouse = s_warehouses[lot.warehouseId];
        if (uint256(warehouse.storedKg) + _measuredKg > warehouse.capacityKg) {
            revert CommodityRegistry__OverCapacity(lot.warehouseId);
        }
        warehouse.storedKg += _measuredKg;

        lot.status = LotStatus.Verified;
        lot.grade = _grade;
        lot.measuredKg = _measuredKg;
        lot.verifiedAt = uint64(block.timestamp);
        lot.verifier = msg.sender;
        lot.evidenceHash = _evidenceHash;

        emit IntakeApproved(_lotId, msg.sender, _measuredKg, _grade, _evidenceHash);

        _mintLotTokens(_lotId, lot.farmer, _measuredKg);
    }

    /// @notice The verifier turns a lot away, recording why.
    function rejectIntake(uint256 _lotId, bytes32 _reason) external whenNotPaused onlyRole(VERIFIER_ROLE) {
        Lot storage lot = _lot(_lotId);
        if (lot.status != LotStatus.Pending) revert CommodityRegistry__InvalidStatus();

        lot.status = LotStatus.Rejected;
        lot.verifier = msg.sender;
        lot.rejectionReason = _reason;

        emit IntakeRejected(_lotId, msg.sender, _reason);
    }

    /*//////////////////////////////////////////////////////////////
                         REGULATOR AND CUSTODY
    //////////////////////////////////////////////////////////////*/

    /// @notice Freezes or unfreezes one lot, for example while its stock is audited.
    function setLotFrozen(uint256 _lotId, bool _frozen) external onlyRole(REGULATOR_ROLE) {
        _lot(_lotId).frozen = _frozen;
        emit LotFrozen(_lotId, _frozen);
    }

    /// @notice Freezes or unfreezes every lot held at a warehouse, and its intake.
    function setWarehouseFrozen(uint256 _warehouseId, bool _frozen) external onlyRole(REGULATOR_ROLE) {
        _warehouse(_warehouseId).frozen = _frozen;
        emit WarehouseFrozen(_warehouseId, _frozen);
    }

    /// @notice Records stock leaving its warehouse when a token holder withdraws it.
    function recordRelease(uint256 _lotId, uint96 _kg) external onlyRole(CUSTODY_ROLE) {
        Lot storage lot = _lot(_lotId);
        if (lot.status != LotStatus.Verified) revert CommodityRegistry__InvalidStatus();

        s_warehouses[lot.warehouseId].storedKg -= _kg;

        emit StockReleased(_lotId, _kg);
    }

    /*//////////////////////////////////////////////////////////////
                             VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function getLot(uint256 _lotId) external view returns (Lot memory) {
        return _lot(_lotId);
    }

    function getWarehouse(uint256 _warehouseId) external view returns (Warehouse memory) {
        if (_warehouseId == 0 || _warehouseId > warehouseCount) {
            revert CommodityRegistry__WarehouseNotFound(_warehouseId);
        }
        return s_warehouses[_warehouseId];
    }

    function getFarmerLots(address _farmer) external view returns (uint256[] memory) {
        return s_farmerLots[_farmer];
    }

    /// @notice The farmer who delivered the lot.
    function lotFarmer(uint256 _lotId) external view returns (address) {
        return _lot(_lotId).farmer;
    }

    /// @notice CommodityConfig id of the lot's crop.
    function commodityOf(uint256 _lotId) external view returns (uint256) {
        return _lot(_lotId).commodityId;
    }

    /// @notice True when the regulator has frozen the lot or its warehouse.
    function isFrozen(uint256 _lotId) public view returns (bool) {
        Lot storage lot = _lot(_lotId);
        return lot.frozen || s_warehouses[lot.warehouseId].frozen;
    }

    /**
     * @notice Grade the lot has aged to by now, starting from its grade at intake.
     * @dev Meaningful only for verified lots; pending ones report their intake grade unchanged.
     */
    function currentGrade(uint256 _lotId) external view returns (Grade) {
        Lot storage lot = _lot(_lotId);
        if (lot.status != LotStatus.Verified) return lot.grade;

        CommodityConfig.Commodity memory commodity = i_config.getCommodity(lot.commodityId);
        uint256 position = _curveStart(commodity, lot.grade) + (block.timestamp - lot.verifiedAt);

        if (position >= uint256(commodity.daysToGradeC) * 1 days) return Grade.C;
        if (position >= uint256(commodity.daysToGradeB) * 1 days) return Grade.B;
        return Grade.A;
    }

    /**
     * @notice Share of its Grade A value (basis points) the lot has decayed to at `_timestamp`.
     * @dev Value slides day by day: from 100% down to the Grade B factor when the lot reaches Grade B,
     *      then down to the Grade C factor at Grade C, then holds until expiry. A lot graded B or C
     *      at intake starts at that point of the curve. Zero for lots that are not verified.
     */
    function valueFactorAt(uint256 _lotId, uint256 _timestamp) public view returns (uint256) {
        Lot storage lot = _lot(_lotId);
        if (lot.status != LotStatus.Verified) return 0;
        return _decay(i_config.getCommodity(lot.commodityId), lot, _timestamp);
    }

    /**
     * @notice What the pool may count of the lot's world-price value at `_timestamp` (basis points):
     *         its decay factor less the commodity's basis cut for transport, export and storage.
     */
    function valuationFactorBps(uint256 _lotId, uint256 _timestamp) external view returns (uint256) {
        Lot storage lot = _lot(_lotId);
        if (lot.status != LotStatus.Verified) return 0;

        CommodityConfig.Commodity memory commodity = i_config.getCommodity(lot.commodityId);
        return (_decay(commodity, lot, _timestamp) * (BPS - commodity.basisBps)) / BPS;
    }

    /// @notice When the lot stops being usable as collateral or for sale. Zero until it is verified.
    function expiresAt(uint256 _lotId) public view returns (uint64) {
        Lot storage lot = _lot(_lotId);
        if (lot.status != LotStatus.Verified) return 0;

        CommodityConfig.Commodity memory commodity = i_config.getCommodity(lot.commodityId);
        return uint64(lot.verifiedAt + uint256(commodity.daysToExpiry) * 1 days - _curveStart(commodity, lot.grade));
    }

    function isExpired(uint256 _lotId) public view returns (bool) {
        uint64 expiry = expiresAt(_lotId);
        return expiry != 0 && block.timestamp >= expiry;
    }

    /// @notice True when the lot is verified, not frozen and not expired: it can back a loan or a sale.
    function isUsable(uint256 _lotId) external view returns (bool) {
        if (_lotId == 0 || _lotId > lotCount) return false;
        return s_lots[_lotId].status == LotStatus.Verified && !isFrozen(_lotId) && !isExpired(_lotId);
    }

    /*//////////////////////////////////////////////////////////////
                         SINGLE-VERIFIER RULE
    //////////////////////////////////////////////////////////////*/

    /// @dev VERIFIER_ROLE has at most one holder: replacing the verifier means revoking it first.
    function _grantRole(bytes32 _role, address _account) internal override returns (bool) {
        if (_role == VERIFIER_ROLE) {
            if (verifier != address(0) && verifier != _account) {
                revert CommodityRegistry__VerifierAlreadySet(verifier);
            }
            verifier = _account;
        }
        return super._grantRole(_role, _account);
    }

    function _revokeRole(bytes32 _role, address _account) internal override returns (bool revoked) {
        revoked = super._revokeRole(_role, _account);
        if (revoked && _role == VERIFIER_ROLE) verifier = address(0);
    }

    /*//////////////////////////////////////////////////////////////
                            INTERNAL HELPERS
    //////////////////////////////////////////////////////////////*/

    function _lot(uint256 _lotId) internal view returns (Lot storage) {
        if (_lotId == 0 || _lotId > lotCount) revert CommodityRegistry__LotNotFound(_lotId);
        return s_lots[_lotId];
    }

    function _warehouse(uint256 _warehouseId) internal view returns (Warehouse storage) {
        if (_warehouseId == 0 || _warehouseId > warehouseCount) {
            revert CommodityRegistry__WarehouseNotFound(_warehouseId);
        }
        return s_warehouses[_warehouseId];
    }

    function _requireWarehouseOpen(uint256 _warehouseId) internal view {
        Warehouse storage warehouse = _warehouse(_warehouseId);
        if (!warehouse.active || warehouse.frozen) revert CommodityRegistry__WarehouseUnavailable(_warehouseId);
    }

    /// @dev Seconds along the decay curve where a lot of `_grade` starts: Grade A starts at zero.
    function _curveStart(CommodityConfig.Commodity memory _commodity, Grade _grade) internal pure returns (uint256) {
        if (_grade == Grade.A) return 0;
        if (_grade == Grade.B) return uint256(_commodity.daysToGradeB) * 1 days;
        return uint256(_commodity.daysToGradeC) * 1 days;
    }

    /// @dev The decay curve described at `valueFactorAt`, evaluated for a verified lot.
    function _decay(CommodityConfig.Commodity memory _commodity, Lot storage _lotData, uint256 _timestamp)
        internal
        view
        returns (uint256)
    {
        uint256 elapsed = _timestamp > _lotData.verifiedAt ? _timestamp - _lotData.verifiedAt : 0;
        uint256 position = _curveStart(_commodity, _lotData.grade) + elapsed;
        uint256 toB = uint256(_commodity.daysToGradeB) * 1 days;
        uint256 toC = uint256(_commodity.daysToGradeC) * 1 days;
        uint256 factorB = _commodity.gradeBFactorBps;
        uint256 factorC = _commodity.gradeCFactorBps;

        if (position >= toC) return factorC;
        if (position >= toB) return factorB - ((factorB - factorC) * (position - toB)) / (toC - toB);
        return BPS - ((BPS - factorB) * position) / toB;
    }

    function _mintLotTokens(uint256 _lotId, address _farmer, uint96 _quantity) internal {
        if (commodityToken == address(0)) revert CommodityRegistry__TokenAddressNotSet();
        // A typed call to an address without code reverts before `try` can catch it.
        if (commodityToken.code.length == 0) revert CommodityRegistry__MintFailed();

        try ICommodityTokenMinter(commodityToken).mint(_farmer, _lotId, _quantity) {}
        catch {
            revert CommodityRegistry__MintFailed();
        }
    }
}
