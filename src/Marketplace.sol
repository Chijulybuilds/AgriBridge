// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ICommodityPriceOracle} from "src/interfaces/ICommodityPriceOracle.sol";

/// @notice The lending-pool calls the marketplace makes: advances against listings, and investors' fee income.
interface IMarketLendingPool {
    function borrowFor(address _borrower, uint256 _lotId, uint256 _collateralKg, uint256 _amount, uint64 _maturity)
        external
        returns (uint256 loanId);
    function sellCollateral(uint256 _loanId, uint256 _kg, address _buyer, uint256 _proceeds)
        external
        returns (uint256 repaid);
    function saleShare(uint256 _loanId, uint256 _kg) external view returns (uint256);
    function loanCollateral(uint256 _loanId)
        external
        view
        returns (address borrower, uint256 lotId, uint256 kg, bool active);
    function addIncome(uint256 _amount) external;
}

/// @notice The registry views the marketplace relies on.
interface IMarketRegistry {
    function commodityOf(uint256 _lotId) external view returns (uint256);
    function isUsable(uint256 _lotId) external view returns (bool);
    function isFrozen(uint256 _lotId) external view returns (bool);
    function isExpired(uint256 _lotId) external view returns (bool);
    function valuationFactorBps(uint256 _lotId, uint256 _timestamp) external view returns (uint256);
}

/**
 * @title Marketplace
 * @author ChijulyBuilds (AgriBridge Protocol Team)
 * @notice Where holders sell graded commodity tokens to buyers for USDC, and where expired stock is
 *         cleared. Sellers list at a fixed price or at a percentage of the live reference value, which
 *         follows the commodity's price and the lot's decay; buyers take any part of a listing. A seller
 *         can add a bulk deal, a discount for large orders, so volume buyers get a better price.
 *         Get paid today, sell at your price: a seller can take an advance from the lending pool as
 *         they list, so they need not cut their price to raise cash quickly. Each sale then repays its
 *         share of the advance before the seller is paid the rest.
 * @dev Listed tokens are held here until bought or the listing is cancelled, except when the listing
 *      carries an advance: those tokens stay pledged in the lending pool, which hands them to the buyer.
 *      Normal listings need a usable lot (verified, not frozen, not expired). Buyers pay the fee on top
 *      of the price, so sellers keep their full asking price; `investorShareBps` of each fee goes to
 *      the lending pool's investors and the rest to the treasury. Expired stock goes through clearance
 *      instead: holders sell it to the protocol at `clearanceDiscountBps` below the reference value,
 *      paid from a fund the admin tops up, and CLEARANCE_ROLE (the Safe) lists it for non-food buyers.
 *      The lending pool never reads prices from here: collateral is valued by the oracle only.
 */
contract Marketplace is AccessControl, Pausable, ReentrancyGuard, ERC1155Holder {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                 TYPES
    //////////////////////////////////////////////////////////////*/

    enum PriceMode {
        Fixed, // `price` is USDC (6 decimals) per kilogram
        Reference // `price` is basis points of the live reference value per kilogram
    }

    struct Listing {
        address seller;
        PriceMode mode;
        bool clearance;
        bool active;
        uint256 lotId;
        uint256 kgRemaining;
        uint256 price;
        /// @dev Bulk deal: one purchase of at least `bulkMinKg` gets `bulkDiscountBps` off. Zero: none.
        uint256 bulkMinKg;
        uint256 bulkDiscountBps;
        /// @dev The lending-pool advance this listing sells the crop of; zero for an ordinary listing.
        uint256 loanId;
    }

    /*//////////////////////////////////////////////////////////////
                               CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Lists and manages cleared stock: the AgriBridge Safe.
    bytes32 public constant CLEARANCE_ROLE = keccak256("CLEARANCE_ROLE");

    uint256 private constant BPS = 10_000;
    uint256 private constant KG = 1e18;
    uint256 public constant MAX_FEE_BPS = 500; // 5%
    uint256 public constant MAX_REFERENCE_BPS = 20_000; // a listing may ask up to 2x the reference
    uint256 public constant MAX_CLEARANCE_DISCOUNT_BPS = 9_000;
    uint256 public constant MAX_BULK_DISCOUNT_BPS = 5_000; // a bulk deal takes at most 50% off
    /// @notice A listing that carries an advance must ask at least this much of the advance's share of the crop.
    uint256 public constant ADVANCE_PRICE_HEADROOM_BPS = 11_000; // 110%

    /*//////////////////////////////////////////////////////////////
                               IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    IERC20 public immutable i_usdc;
    IERC1155 public immutable i_token;
    IMarketRegistry public immutable i_registry;
    ICommodityPriceOracle public immutable i_oracle;
    IMarketLendingPool public immutable i_pool;

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    uint256 public feeBps = 100; // 1%, paid by the buyer on top of the price
    address public feeRecipient;
    /// @notice Share of each fee paid to the lending pool's investors; the treasury keeps the rest.
    uint256 public investorShareBps = 5_000; // 50%
    uint256 public clearanceDiscountBps = 3_000; // expired stock bought at 30% below reference
    /// @notice USDC set aside to buy expired stock.
    uint256 public clearanceFund;
    /// @notice Kilograms of each lot the protocol has bought through clearance and not yet listed.
    mapping(uint256 => uint256) public clearanceInventory;

    uint256 public listingCount;
    mapping(uint256 => Listing) private s_listings;
    /// @notice The open listing selling each advance's crop, if any.
    mapping(uint256 => uint256) public listingOfLoan;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event Listed(
        uint256 indexed listingId,
        address indexed seller,
        uint256 indexed lotId,
        uint256 kg,
        PriceMode mode,
        uint256 price
    );
    event Repriced(uint256 indexed listingId, PriceMode mode, uint256 price);
    event BulkDealSet(uint256 indexed listingId, uint256 minKg, uint256 discountBps);
    event Bought(
        uint256 indexed listingId, address indexed buyer, uint256 indexed lotId, uint256 kg, uint256 cost, uint256 fee
    );
    event ListingCancelled(uint256 indexed listingId, uint256 kgReturned);
    event ExpiredStockSold(address indexed seller, uint256 indexed lotId, uint256 kg, uint256 paid);
    event ClearanceFunded(address indexed from, uint256 amount);
    event ClearanceFundWithdrawn(address indexed to, uint256 amount);
    event FeesUpdated(uint256 feeBps, address feeRecipient, uint256 clearanceDiscountBps);
    event AdvanceListed(uint256 indexed listingId, uint256 indexed loanId);
    event FeeShared(uint256 indexed listingId, uint256 toInvestors, uint256 toTreasury);
    event InvestorShareUpdated(uint256 investorShareBps);

    /*//////////////////////////////////////////////////////////////
                             CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    error Marketplace__InvalidAddress();
    error Marketplace__InvalidAmount();
    error Marketplace__InvalidPrice();
    error Marketplace__LotNotTradable();
    error Marketplace__LotNotExpired();
    error Marketplace__ListingNotActive();
    error Marketplace__NotSeller();
    error Marketplace__PriceAboveLimit();
    error Marketplace__InsufficientClearanceFund();
    error Marketplace__InsufficientInventory();
    error Marketplace__InvalidParameters();
    error Marketplace__PriceBelowAdvance(uint256 minPricePerKg);
    error Marketplace__LoanAlreadyListed();

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @param _admin Receives DEFAULT_ADMIN_ROLE and CLEARANCE_ROLE: the AgriBridge Safe.
     * @param _pool The lending pool: it lends against listings and receives investors' share of fees.
     * @param _feeRecipient Treasury that receives the rest of the fees and the proceeds of cleared stock.
     */
    constructor(
        address _admin,
        address _usdc,
        address _token,
        address _registry,
        address _oracle,
        address _pool,
        address _feeRecipient
    ) {
        if (
            _admin == address(0) || _usdc == address(0) || _token == address(0) || _registry == address(0)
                || _oracle == address(0) || _pool == address(0) || _feeRecipient == address(0)
        ) {
            revert Marketplace__InvalidAddress();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(CLEARANCE_ROLE, _admin);
        i_usdc = IERC20(_usdc);
        i_token = IERC1155(_token);
        i_registry = IMarketRegistry(_registry);
        i_oracle = ICommodityPriceOracle(_oracle);
        i_pool = IMarketLendingPool(_pool);
        feeRecipient = _feeRecipient;
        // The pool takes the tokens a seller lists with an advance from here, as collateral.
        IERC1155(_token).setApprovalForAll(_pool, true);
    }

    /*//////////////////////////////////////////////////////////////
                                SELLERS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Lists `_kg` of a lot for sale. The tokens move here until sold or the listing is cancelled.
     * @param _mode Fixed: `_price` is USDC per kilogram. Reference: `_price` is basis points of the live
     *        reference value, so the asking price follows the market and the lot's decay.
     * @param _bulkMinKg With `_bulkDiscountBps`, an optional bulk deal: one purchase of at least this
     *        many kilograms gets `_bulkDiscountBps` off. Zeros for none.
     */
    function list(
        uint256 _lotId,
        uint256 _kg,
        PriceMode _mode,
        uint256 _price,
        uint256 _bulkMinKg,
        uint256 _bulkDiscountBps
    ) external whenNotPaused nonReentrant returns (uint256 listingId) {
        if (_kg == 0) revert Marketplace__InvalidAmount();
        _requirePrice(_mode, _price);
        _requireBulkDeal(_bulkMinKg, _bulkDiscountBps);
        if (!i_registry.isUsable(_lotId)) revert Marketplace__LotNotTradable();

        listingId = _create(msg.sender, _lotId, _kg, _mode, _price, false);
        if (_bulkDiscountBps != 0) _setBulkDeal(listingId, _bulkMinKg, _bulkDiscountBps);
        i_token.safeTransferFrom(msg.sender, address(this), _lotId, _kg, "");
    }

    /**
     * @notice Lists `_kg` of a lot and takes an advance against it in the same step: get paid today,
     *         sell at your price. The crop is pledged to the lending pool, the advance is paid to the
     *         seller now, and each sale repays its share of the advance before the seller gets the rest.
     *         The asking price must cover the advance with ADVANCE_PRICE_HEADROOM_BPS to spare.
     * @param _advance USDC to take now, within the pool's limit for this crop and end date.
     * @param _maturity When the advance is due if the crop has not sold by then.
     */
    function listWithAdvance(
        uint256 _lotId,
        uint256 _kg,
        PriceMode _mode,
        uint256 _price,
        uint256 _bulkMinKg,
        uint256 _bulkDiscountBps,
        uint256 _advance,
        uint64 _maturity
    ) external whenNotPaused nonReentrant returns (uint256 listingId, uint256 loanId) {
        if (_kg == 0) revert Marketplace__InvalidAmount();
        _requirePrice(_mode, _price);
        _requireBulkDeal(_bulkMinKg, _bulkDiscountBps);
        if (!i_registry.isUsable(_lotId)) revert Marketplace__LotNotTradable();

        i_token.safeTransferFrom(msg.sender, address(this), _lotId, _kg, "");
        loanId = i_pool.borrowFor(msg.sender, _lotId, _kg, _advance, _maturity);
        listingId = _createForLoan(msg.sender, _lotId, _kg, _mode, _price, loanId);
        if (_bulkDiscountBps != 0) _setBulkDeal(listingId, _bulkMinKg, _bulkDiscountBps);
        _requireCoversAdvance(listingId);
    }

    /**
     * @notice Lists all the crop behind an advance the seller already has, such as one taken at the
     *         warehouse gate, so it sells at their price and each sale repays its share of the advance.
     */
    function listCollateral(
        uint256 _loanId,
        PriceMode _mode,
        uint256 _price,
        uint256 _bulkMinKg,
        uint256 _bulkDiscountBps
    ) external whenNotPaused nonReentrant returns (uint256 listingId) {
        (address borrower, uint256 lotId, uint256 kg, bool open) = i_pool.loanCollateral(_loanId);
        if (!open) revert Marketplace__ListingNotActive();
        if (borrower != msg.sender) revert Marketplace__NotSeller();
        _requirePrice(_mode, _price);
        _requireBulkDeal(_bulkMinKg, _bulkDiscountBps);
        if (!i_registry.isUsable(lotId)) revert Marketplace__LotNotTradable();

        listingId = _createForLoan(msg.sender, lotId, kg, _mode, _price, _loanId);
        if (_bulkDiscountBps != 0) _setBulkDeal(listingId, _bulkMinKg, _bulkDiscountBps);
        _requireCoversAdvance(listingId);
    }

    /// @notice Changes a listing's price and its bulk deal (zeros remove the deal).
    function reprice(uint256 _listingId, PriceMode _mode, uint256 _price, uint256 _bulkMinKg, uint256 _bulkDiscountBps)
        external
    {
        Listing storage listing = _activeListing(_listingId);
        if (listing.seller != msg.sender || listing.clearance) revert Marketplace__NotSeller();
        _requirePrice(_mode, _price);
        _requireBulkDeal(_bulkMinKg, _bulkDiscountBps);

        listing.mode = _mode;
        listing.price = _price;
        emit Repriced(_listingId, _mode, _price);
        _setBulkDeal(_listingId, _bulkMinKg, _bulkDiscountBps);
        if (listing.loanId != 0) _requireCoversAdvance(_listingId);
    }

    /**
     * @notice Takes a listing down and returns the unsold tokens. Clearance stock returns to inventory;
     *         the crop behind an advance stays pledged to it.
     */
    function cancel(uint256 _listingId) external nonReentrant {
        Listing storage listing = _activeListing(_listingId);
        if (listing.clearance) {
            _checkRole(CLEARANCE_ROLE);
        } else if (listing.seller != msg.sender) {
            revert Marketplace__NotSeller();
        }

        uint256 kg = listing.kgRemaining;
        listing.kgRemaining = 0;
        _close(listing);

        if (listing.clearance) {
            clearanceInventory[listing.lotId] += kg;
        } else if (listing.loanId != 0) {
            kg = 0; // nothing is returned: the crop is still the advance's collateral
        } else {
            i_token.safeTransferFrom(address(this), listing.seller, listing.lotId, kg, "");
        }
        emit ListingCancelled(_listingId, kg);
    }

    /*//////////////////////////////////////////////////////////////
                                 BUYERS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Buys `_kg` from a listing, paying the price plus the marketplace fee on top, at most
     *         `_maxCost` USDC in all (a guard against the price moving between quote and purchase).
     *         The seller receives the full price; when the listing carries an advance, the advance's
     *         share of the crop is repaid out of it first. The fee is shared with the pool's investors.
     * @return paid What the buyer paid: the price plus the fee.
     */
    function buy(uint256 _listingId, uint256 _kg, uint256 _maxCost)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 paid)
    {
        Listing storage listing = _activeListing(_listingId);
        if (_kg == 0 || _kg > listing.kgRemaining) revert Marketplace__InvalidAmount();
        bool tradable = listing.clearance ? !i_registry.isFrozen(listing.lotId) : i_registry.isUsable(listing.lotId);
        if (!tradable) revert Marketplace__LotNotTradable();

        uint256 cost = quote(_listingId, _kg);
        if (cost == 0) revert Marketplace__InvalidAmount();
        uint256 fee = listing.clearance ? 0 : (cost * feeBps) / BPS;
        paid = cost + fee;
        if (paid > _maxCost) revert Marketplace__PriceAboveLimit();

        listing.kgRemaining -= _kg;
        if (listing.kgRemaining == 0) _close(listing);

        i_usdc.safeTransferFrom(msg.sender, address(this), paid);
        uint256 toSeller = cost;
        if (listing.loanId != 0) {
            i_usdc.forceApprove(address(i_pool), cost);
            toSeller -= i_pool.sellCollateral(listing.loanId, _kg, msg.sender, cost);
            i_usdc.forceApprove(address(i_pool), 0);
        } else {
            i_token.safeTransferFrom(address(this), msg.sender, listing.lotId, _kg, "");
        }
        if (toSeller > 0) i_usdc.safeTransfer(listing.clearance ? feeRecipient : listing.seller, toSeller);
        _shareFee(_listingId, fee);

        emit Bought(_listingId, msg.sender, listing.lotId, _kg, cost, fee);
    }

    /*//////////////////////////////////////////////////////////////
                               CLEARANCE
    //////////////////////////////////////////////////////////////*/

    /// @notice A holder of expired stock sells it to the protocol, below the reference value.
    function sellExpired(uint256 _lotId, uint256 _kg) external whenNotPaused nonReentrant returns (uint256 paid) {
        if (_kg == 0) revert Marketplace__InvalidAmount();
        if (!i_registry.isExpired(_lotId)) revert Marketplace__LotNotExpired();
        if (i_registry.isFrozen(_lotId)) revert Marketplace__LotNotTradable();

        paid = clearanceQuote(_lotId, _kg);
        if (paid == 0) revert Marketplace__InvalidAmount();
        if (paid > clearanceFund) revert Marketplace__InsufficientClearanceFund();

        clearanceFund -= paid;
        clearanceInventory[_lotId] += _kg;

        i_token.safeTransferFrom(msg.sender, address(this), _lotId, _kg, "");
        i_usdc.safeTransfer(msg.sender, paid);

        emit ExpiredStockSold(msg.sender, _lotId, _kg, paid);
    }

    /// @notice Lists cleared stock at a fixed price for non-food buyers; proceeds go to the treasury.
    function listClearance(uint256 _lotId, uint256 _kg, uint256 _pricePerKg)
        external
        onlyRole(CLEARANCE_ROLE)
        returns (uint256 listingId)
    {
        if (_kg == 0 || _kg > clearanceInventory[_lotId]) {
            revert Marketplace__InsufficientInventory();
        }
        _requirePrice(PriceMode.Fixed, _pricePerKg);

        clearanceInventory[_lotId] -= _kg;
        listingId = _create(feeRecipient, _lotId, _kg, PriceMode.Fixed, _pricePerKg, true);
    }

    function fundClearance(uint256 _amount) external nonReentrant {
        if (_amount == 0) revert Marketplace__InvalidAmount();
        i_usdc.safeTransferFrom(msg.sender, address(this), _amount);
        clearanceFund += _amount;
        emit ClearanceFunded(msg.sender, _amount);
    }

    function withdrawClearanceFund(address _to, uint256 _amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (_amount == 0 || _amount > clearanceFund) revert Marketplace__InsufficientClearanceFund();
        clearanceFund -= _amount;
        i_usdc.safeTransfer(_to, _amount);
        emit ClearanceFundWithdrawn(_to, _amount);
    }

    /*//////////////////////////////////////////////////////////////
                                 ADMIN
    //////////////////////////////////////////////////////////////*/

    function setFees(uint256 _feeBps, address _feeRecipient, uint256 _clearanceDiscountBps)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (_feeBps > MAX_FEE_BPS || _feeRecipient == address(0) || _clearanceDiscountBps > MAX_CLEARANCE_DISCOUNT_BPS)
        {
            revert Marketplace__InvalidParameters();
        }
        feeBps = _feeBps;
        feeRecipient = _feeRecipient;
        clearanceDiscountBps = _clearanceDiscountBps;
        emit FeesUpdated(_feeBps, _feeRecipient, _clearanceDiscountBps);
    }

    /// @notice Sets the share of each fee paid to the lending pool's investors, in basis points.
    function setInvestorShare(uint256 _investorShareBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_investorShareBps > BPS) revert Marketplace__InvalidParameters();
        investorShareBps = _investorShareBps;
        emit InvestorShareUpdated(_investorShareBps);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
                                 VIEWS
    //////////////////////////////////////////////////////////////*/

    function getListing(uint256 _listingId) external view returns (Listing memory) {
        return s_listings[_listingId];
    }

    /**
     * @notice What a kilogram of a lot is worth now (USDC, 6 decimals): its commodity's fresh oracle
     *         price times its valuation factor (grade decay less the basis cut). Reverts on a stale price.
     */
    function referencePricePerKg(uint256 _lotId) public view returns (uint256) {
        uint256 price = i_oracle.getPriceFresh(i_registry.commodityOf(_lotId));
        // price(8 decimals) * 1 kg(18) * factor(bps) / (1e20 * 1e4) = USDC(6 decimals) per kg
        return (price * i_registry.valuationFactorBps(_lotId, block.timestamp)) / 1e6;
    }

    /// @notice Current asking price of a listing, USDC (6 decimals) per kilogram.
    function pricePerKg(uint256 _listingId) public view returns (uint256) {
        Listing storage listing = s_listings[_listingId];
        if (listing.mode == PriceMode.Fixed) return listing.price;
        return (referencePricePerKg(listing.lotId) * listing.price) / BPS;
    }

    /// @notice What `_kg` from a listing costs now (USDC, 6 decimals), after its bulk deal if the order qualifies.
    function quote(uint256 _listingId, uint256 _kg) public view returns (uint256 cost) {
        Listing storage listing = s_listings[_listingId];
        cost = _ceilDiv(pricePerKg(_listingId) * _kg, KG);
        if (listing.bulkDiscountBps != 0 && _kg >= listing.bulkMinKg) {
            cost -= (cost * listing.bulkDiscountBps) / BPS;
        }
    }

    /// @notice What a buyer pays for `_kg` from a listing now: the price, and the fee on top of it.
    function quoteWithFee(uint256 _listingId, uint256 _kg) external view returns (uint256 cost, uint256 fee) {
        cost = quote(_listingId, _kg);
        fee = s_listings[_listingId].clearance ? 0 : (cost * feeBps) / BPS;
    }

    /**
     * @notice Kilograms a buyer can take from a listing now: less than listed if the advance behind it
     *         was settled in part, and none once that advance is closed.
     */
    function availableKg(uint256 _listingId) external view returns (uint256) {
        Listing storage listing = s_listings[_listingId];
        if (!listing.active) return 0;
        if (listing.loanId == 0) return listing.kgRemaining;
        (,, uint256 kg, bool open) = i_pool.loanCollateral(listing.loanId);
        if (!open) return 0;
        return kg < listing.kgRemaining ? kg : listing.kgRemaining;
    }

    /// @notice What the protocol pays for `_kg` of an expired lot now.
    function clearanceQuote(uint256 _lotId, uint256 _kg) public view returns (uint256) {
        return (referencePricePerKg(_lotId) * (BPS - clearanceDiscountBps) * _kg) / (BPS * KG);
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    function _create(address _seller, uint256 _lotId, uint256 _kg, PriceMode _mode, uint256 _price, bool _clearance)
        internal
        returns (uint256 listingId)
    {
        listingId = ++listingCount;
        s_listings[listingId] = Listing({
            seller: _seller,
            mode: _mode,
            clearance: _clearance,
            active: true,
            lotId: _lotId,
            kgRemaining: _kg,
            price: _price,
            bulkMinKg: 0,
            bulkDiscountBps: 0,
            loanId: 0
        });
        emit Listed(listingId, _seller, _lotId, _kg, _mode, _price);
    }

    /// @dev A listing selling the crop behind `_loanId`; an advance has at most one open listing.
    function _createForLoan(
        address _seller,
        uint256 _lotId,
        uint256 _kg,
        PriceMode _mode,
        uint256 _price,
        uint256 _loanId
    ) internal returns (uint256 listingId) {
        if (listingOfLoan[_loanId] != 0) revert Marketplace__LoanAlreadyListed();
        listingId = _create(_seller, _lotId, _kg, _mode, _price, false);
        s_listings[listingId].loanId = _loanId;
        listingOfLoan[_loanId] = listingId;
        emit AdvanceListed(listingId, _loanId);
    }

    function _close(Listing storage _listing) internal {
        _listing.active = false;
        if (_listing.loanId != 0) delete listingOfLoan[_listing.loanId];
    }

    /**
     * @dev A listing that carries an advance must ask, per kilogram and after its bulk deal, at least
     *      ADVANCE_PRICE_HEADROOM_BPS of the advance's share of each kilogram, so every sale can repay
     *      its share with room for interest and price moves. The error gives the lowest asking price
     *      per kilogram that would pass.
     */
    function _requireCoversAdvance(uint256 _listingId) internal view {
        Listing storage listing = s_listings[_listingId];
        uint256 kg = listing.kgRemaining;
        uint256 share = i_pool.saleShare(listing.loanId, kg);
        uint256 neededPerKg = _ceilDiv(share * ADVANCE_PRICE_HEADROOM_BPS * KG, BPS * kg);
        uint256 lowestPerKg = (pricePerKg(_listingId) * (BPS - listing.bulkDiscountBps)) / BPS;
        if (lowestPerKg < neededPerKg) {
            revert Marketplace__PriceBelowAdvance(_ceilDiv(neededPerKg * BPS, BPS - listing.bulkDiscountBps));
        }
    }

    /// @dev Sends `investorShareBps` of a fee to the lending pool's investors and the rest to the treasury.
    function _shareFee(uint256 _listingId, uint256 _fee) internal {
        if (_fee == 0) return;
        uint256 toInvestors = (_fee * investorShareBps) / BPS;
        if (toInvestors > 0) {
            i_usdc.forceApprove(address(i_pool), toInvestors);
            i_pool.addIncome(toInvestors);
        }
        if (_fee > toInvestors) i_usdc.safeTransfer(feeRecipient, _fee - toInvestors);
        emit FeeShared(_listingId, toInvestors, _fee - toInvestors);
    }

    function _setBulkDeal(uint256 _listingId, uint256 _minKg, uint256 _discountBps) internal {
        Listing storage listing = s_listings[_listingId];
        listing.bulkMinKg = _discountBps == 0 ? 0 : _minKg;
        listing.bulkDiscountBps = _discountBps;
        emit BulkDealSet(_listingId, listing.bulkMinKg, _discountBps);
    }

    function _activeListing(uint256 _listingId) internal view returns (Listing storage listing) {
        listing = s_listings[_listingId];
        if (!listing.active) revert Marketplace__ListingNotActive();
    }

    function _requirePrice(PriceMode _mode, uint256 _price) internal pure {
        if (_price == 0 || (_mode == PriceMode.Reference && _price > MAX_REFERENCE_BPS)) {
            revert Marketplace__InvalidPrice();
        }
    }

    /// @dev A bulk deal needs a minimum order and takes at most MAX_BULK_DISCOUNT_BPS off; zeros mean none.
    function _requireBulkDeal(uint256 _minKg, uint256 _discountBps) internal pure {
        if (_discountBps > MAX_BULK_DISCOUNT_BPS || (_discountBps != 0 && _minKg == 0)) {
            revert Marketplace__InvalidPrice();
        }
    }

    function _ceilDiv(uint256 _a, uint256 _b) internal pure returns (uint256) {
        return _a == 0 ? 0 : (_a - 1) / _b + 1;
    }

    function supportsInterface(bytes4 _interfaceId) public view override(AccessControl, ERC1155Holder) returns (bool) {
        return AccessControl.supportsInterface(_interfaceId) || ERC1155Holder.supportsInterface(_interfaceId);
    }
}
