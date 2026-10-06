// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {CommodityConfig} from "src/CommodityConfig.sol";

/// @notice The token surface the desk uses; it needs BURNER_ROLE and PROTOCOL_ROLE there.
interface IBurnableCommodityToken {
    function safeTransferFrom(address _from, address _to, uint256 _id, uint256 _value, bytes calldata _data) external;
    function burn(address _from, uint256 _lotId, uint256 _amount) external;
}

/**
 * @title WarehouseDesk
 * @author ChijulyBuilds (AgriBridge Protocol Team)
 * @notice Turns commodity tokens back into produce. A holder asks to withdraw some kilograms, for
 *         pickup at the warehouse or for delivery, and pays the storage those kilograms have run up
 *         since intake. The custodian (the Safe) confirms when the goods leave the warehouse; only then
 *         are the tokens burned and the warehouse's stock reduced, so tokens always match stored stock.
 * @dev Delivery is quoted by the warehouse, so the holder escrows a budget; the custodian charges the
 *      actual fee, up to the budget, and the rest is refunded. A request the holder cancels, or the
 *      custodian rejects, gets back its tokens and every fee. Storage is charged per day, at the
 *      commodity's rate per metric ton per 30 days, and paid by whoever withdraws.
 */
contract WarehouseDesk is AccessControl, ReentrancyGuard, ERC1155Holder {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                 TYPES
    //////////////////////////////////////////////////////////////*/

    enum RequestStatus {
        Pending,
        Released,
        Cancelled,
        Rejected
    }

    struct Request {
        address holder;
        RequestStatus status;
        uint64 requestedAt;
        uint256 lotId;
        uint256 kg;
        uint256 storageFee;
        /// @dev Escrowed for delivery; zero means pickup.
        uint256 deliveryBudget;
    }

    /*//////////////////////////////////////////////////////////////
                               CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Confirms that goods left the warehouse: the AgriBridge Safe.
    bytes32 public constant CUSTODIAN_ROLE = keccak256("CUSTODIAN_ROLE");

    uint256 private constant KG_PER_TON = 1_000e18;
    uint256 private constant STORAGE_MONTH = 30 days;

    /*//////////////////////////////////////////////////////////////
                               IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    IERC20 public immutable i_usdc;
    IBurnableCommodityToken public immutable i_token;
    CommodityRegistry public immutable i_registry;
    CommodityConfig public immutable i_config;

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Treasury that receives storage and delivery fees.
    address public feeRecipient;

    uint256 public requestCount;
    mapping(uint256 => Request) private s_requests;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event WithdrawalRequested(
        uint256 indexed requestId,
        address indexed holder,
        uint256 indexed lotId,
        uint256 kg,
        uint256 storageFee,
        uint256 deliveryBudget
    );
    event WithdrawalReleased(uint256 indexed requestId, uint256 deliveryFee);
    event WithdrawalCancelled(uint256 indexed requestId);
    event WithdrawalRejected(uint256 indexed requestId, bytes32 reason);
    event FeeRecipientSet(address feeRecipient);

    /*//////////////////////////////////////////////////////////////
                             CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    error WarehouseDesk__InvalidAddress();
    error WarehouseDesk__InvalidAmount();
    error WarehouseDesk__LotNotVerified();
    error WarehouseDesk__LotFrozen();
    error WarehouseDesk__NotPending();
    error WarehouseDesk__NotHolder();
    error WarehouseDesk__DeliveryOverBudget();

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @param _admin Receives DEFAULT_ADMIN_ROLE.
     * @param _custodian Receives CUSTODIAN_ROLE: the verifier Safe, which runs the warehouses.
     * @param _feeRecipient Treasury for storage and delivery fees.
     */
    constructor(
        address _admin,
        address _custodian,
        address _usdc,
        address _token,
        CommodityRegistry _registry,
        address _feeRecipient
    ) {
        if (
            _admin == address(0) || _custodian == address(0) || _usdc == address(0) || _token == address(0)
                || address(_registry) == address(0) || _feeRecipient == address(0)
        ) {
            revert WarehouseDesk__InvalidAddress();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(CUSTODIAN_ROLE, _custodian);
        i_usdc = IERC20(_usdc);
        i_token = IBurnableCommodityToken(_token);
        i_registry = _registry;
        i_config = _registry.i_config();
        feeRecipient = _feeRecipient;
    }

    /*//////////////////////////////////////////////////////////////
                                HOLDERS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Asks to take `_kg` of a lot out of the warehouse. The tokens and the storage fee are held
     *         here until the custodian confirms the release.
     * @param _deliveryBudget USDC escrowed for delivery, or zero to collect at the warehouse.
     */
    function requestWithdrawal(uint256 _lotId, uint256 _kg, uint256 _deliveryBudget)
        external
        nonReentrant
        returns (uint256 requestId)
    {
        if (_kg == 0) revert WarehouseDesk__InvalidAmount();
        if (i_registry.getLot(_lotId).status != CommodityRegistry.LotStatus.Verified) {
            revert WarehouseDesk__LotNotVerified();
        }
        if (i_registry.isFrozen(_lotId)) revert WarehouseDesk__LotFrozen();

        uint256 storageFee = storageFeeOf(_lotId, _kg);
        requestId = ++requestCount;
        s_requests[requestId] = Request({
            holder: msg.sender,
            status: RequestStatus.Pending,
            requestedAt: uint64(block.timestamp),
            lotId: _lotId,
            kg: _kg,
            storageFee: storageFee,
            deliveryBudget: _deliveryBudget
        });

        if (storageFee + _deliveryBudget > 0) {
            i_usdc.safeTransferFrom(msg.sender, address(this), storageFee + _deliveryBudget);
        }
        i_token.safeTransferFrom(msg.sender, address(this), _lotId, _kg, "");

        emit WithdrawalRequested(requestId, msg.sender, _lotId, _kg, storageFee, _deliveryBudget);
    }

    /// @notice The holder withdraws a request the custodian has not acted on; everything comes back.
    function cancelRequest(uint256 _requestId) external nonReentrant {
        Request storage request = _pending(_requestId);
        if (request.holder != msg.sender) revert WarehouseDesk__NotHolder();

        request.status = RequestStatus.Cancelled;
        _refund(request, request.storageFee + request.deliveryBudget);
        emit WithdrawalCancelled(_requestId);
    }

    /*//////////////////////////////////////////////////////////////
                               CUSTODIAN
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Confirms the goods left the warehouse: burns the tokens, lowers the warehouse's stock, and
     *         pays the storage fee and the actual delivery fee; any unused delivery budget is refunded.
     */
    function confirmRelease(uint256 _requestId, uint256 _deliveryFee) external nonReentrant onlyRole(CUSTODIAN_ROLE) {
        Request storage request = _pending(_requestId);
        if (_deliveryFee > request.deliveryBudget) revert WarehouseDesk__DeliveryOverBudget();
        if (i_registry.isFrozen(request.lotId)) revert WarehouseDesk__LotFrozen();

        request.status = RequestStatus.Released;

        i_token.burn(address(this), request.lotId, request.kg);
        // forge-lint: disable-next-line(unsafe-typecast)
        i_registry.recordRelease(request.lotId, uint96(request.kg)); // a lot never exceeds uint96 kilograms

        uint256 fees = request.storageFee + _deliveryFee;
        if (fees > 0) i_usdc.safeTransfer(feeRecipient, fees);
        uint256 unused = request.deliveryBudget - _deliveryFee;
        if (unused > 0) i_usdc.safeTransfer(request.holder, unused);

        emit WithdrawalReleased(_requestId, _deliveryFee);
    }

    /// @notice Turns a request down, e.g. when the warehouse cannot fulfil it; everything comes back.
    function rejectRequest(uint256 _requestId, bytes32 _reason) external nonReentrant onlyRole(CUSTODIAN_ROLE) {
        Request storage request = _pending(_requestId);
        request.status = RequestStatus.Rejected;
        _refund(request, request.storageFee + request.deliveryBudget);
        emit WithdrawalRejected(_requestId, _reason);
    }

    function setFeeRecipient(address _feeRecipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_feeRecipient == address(0)) revert WarehouseDesk__InvalidAddress();
        feeRecipient = _feeRecipient;
        emit FeeRecipientSet(_feeRecipient);
    }

    /*//////////////////////////////////////////////////////////////
                                 VIEWS
    //////////////////////////////////////////////////////////////*/

    function getRequest(uint256 _requestId) external view returns (Request memory) {
        return s_requests[_requestId];
    }

    /**
     * @notice Storage owed on `_kg` of a lot today: the commodity's rate per metric ton per 30 days,
     *         pro rata by the day since intake, rounded up.
     */
    function storageFeeOf(uint256 _lotId, uint256 _kg) public view returns (uint256) {
        CommodityRegistry.Lot memory lot = i_registry.getLot(_lotId);
        if (lot.status != CommodityRegistry.LotStatus.Verified) return 0;

        uint256 rate = i_config.getCommodity(lot.commodityId).storageFeePerTonMonth;
        uint256 elapsed = block.timestamp - lot.verifiedAt;
        uint256 numerator = rate * _kg * elapsed;
        uint256 denominator = KG_PER_TON * STORAGE_MONTH;
        return numerator == 0 ? 0 : (numerator - 1) / denominator + 1;
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    function _pending(uint256 _requestId) internal view returns (Request storage request) {
        request = s_requests[_requestId];
        if (request.holder == address(0) || request.status != RequestStatus.Pending) {
            revert WarehouseDesk__NotPending();
        }
    }

    function _refund(Request storage _request, uint256 _usdc) internal {
        if (_usdc > 0) i_usdc.safeTransfer(_request.holder, _usdc);
        i_token.safeTransferFrom(address(this), _request.holder, _request.lotId, _request.kg, "");
    }

    function supportsInterface(bytes4 _interfaceId) public view override(AccessControl, ERC1155Holder) returns (bool) {
        return AccessControl.supportsInterface(_interfaceId) || ERC1155Holder.supportsInterface(_interfaceId);
    }
}
