// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {AgriShareToken} from "src/AgriShareToken.sol";
import {CommodityConfig} from "src/CommodityConfig.sol";
import {ICommodityPriceOracle} from "src/interfaces/ICommodityPriceOracle.sol";

/*//////////////////////////////////////////////////////////////
                          INTERFACES
//////////////////////////////////////////////////////////////*/

/// @notice The registry views the pool relies on.
interface ICommodityRegistry {
    function commodityOf(uint256 _lotId) external view returns (uint256);
    function isUsable(uint256 _lotId) external view returns (bool);
    function isFrozen(uint256 _lotId) external view returns (bool);
    function expiresAt(uint256 _lotId) external view returns (uint64);
    function valuationFactorBps(uint256 _lotId, uint256 _timestamp) external view returns (uint256);
}

interface ICommodityToken {
    function balanceOf(address _account, uint256 _id) external view returns (uint256);
    function safeTransferFrom(address _from, address _to, uint256 _id, uint256 _value, bytes calldata _data) external;
}

/*//////////////////////////////////////////////////////////////
                         MAIN CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title LendingPool
 * @author ChijulyBuilds (AgriBridge Protocol Team)
 * @notice Investors deposit USDC for agUSDC shares; holders of commodity tokens borrow USDC against them.
 * @dev Lending rules, per commodity from CommodityConfig:
 *      - A loan may be at most `maxLtvBps` of the collateral's value at the loan's maturity, so the
 *        decay the lot will go through before then is priced in from day one. Maturity must fall at
 *        least MATURITY_BUFFER before the lot expires.
 *      - A loan becomes liquidatable once its debt reaches `liquidationLtvBps` of the collateral's
 *        current value, or GRACE_PERIOD after an unpaid maturity. Anyone may liquidate: they pay the
 *        debt and receive collateral worth the debt plus LIQUIDATION_BONUS_BPS; the rest goes back to
 *        the borrower. If the collateral is worth less than that, the liquidator gets all of it for
 *        its value less the bonus, and protocol reserves absorb the shortfall.
 *      - The keeper (KEEPER_ROLE) can liquidate with protocol reserves instead, so investors are
 *        repaid even when no outside liquidator steps in; the pool keeps that collateral as protocol
 *        inventory for the admin to sell.
 *      Accounting: cash is tracked internally, so USDC sent straight to the pool changes nothing.
 *      Debt is scaled by a borrow index, so interest counts continuously: the pool's value (cash plus
 *      debt, less reserves) grows smoothly rather than jumping when a loan is repaid, which leaves
 *      nothing to sandwich. Reserves (a share of interest) never back withdrawals or loans.
 */
contract LendingPool is AccessControl, Pausable, ReentrancyGuard, ERC1155Holder {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                               CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Liquidates with protocol reserves: the Automation keeper.
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    uint256 private constant WAD = 1e18;
    uint256 private constant BPS = 10_000;
    /// @dev Converts an 8-decimal price times an 18-decimal quantity into 6-decimal USDC.
    uint256 private constant PRICE_TO_USDC_SCALING = 1e20;
    uint256 private constant SECONDS_PER_YEAR = 365 days;

    // Interest rate model (kink), annual rates in WAD
    uint256 private constant BASE_RATE = 5e16; // 5%
    uint256 private constant SLOPE_BELOW_KINK = 10e16; // +10% across 0-80% utilisation
    uint256 private constant SLOPE_ABOVE_KINK = 50e16; // +50% across 80-100%
    uint256 private constant KINK = 80e16; // 80% utilisation

    uint256 public constant LIQUIDATION_BONUS_BPS = 500; // 5%
    uint256 public constant MIN_LOAN_TERM = 1 days;
    uint256 public constant MATURITY_BUFFER = 30 days;
    uint256 public constant GRACE_PERIOD = 7 days;
    uint256 public constant MIN_BORROW_AMOUNT = 100e6; // $100
    uint256 public constant MAX_BORROW_AMOUNT = 10_000_000e6; // $10M
    uint256 public constant MAX_RESERVE_FACTOR = 50e16; // 50%

    /// @dev Virtual shares and assets (OpenZeppelin ERC-4626 style) blunt share-price manipulation.
    uint256 private constant VIRTUAL_SHARES = 1;
    uint256 private constant VIRTUAL_ASSETS = 1;

    /*//////////////////////////////////////////////////////////////
                                 TYPES
    //////////////////////////////////////////////////////////////*/

    enum LoanStatus {
        ACTIVE,
        REPAID,
        LIQUIDATED
    }

    struct Loan {
        address borrower;
        uint64 openedAt;
        uint64 maturity;
        LoanStatus status;
        uint256 lotId;
        uint256 collateralKg;
        /// @dev USDC borrowed, kept for display.
        uint256 principal;
        /// @dev Debt divided by the borrow index; times the current index gives what is owed now.
        uint256 scaledDebt;
    }

    /*//////////////////////////////////////////////////////////////
                               IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    IERC20 public immutable i_usdc;
    ICommodityRegistry public immutable i_registry;
    ICommodityToken public immutable i_commodityToken;
    AgriShareToken public immutable i_shareToken;
    ICommodityPriceOracle public immutable i_priceOracle;
    CommodityConfig public immutable i_config;

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice USDC the pool holds by its own books (deposits and repayments in, loans and withdrawals out).
    uint256 public cash;
    /// @notice The protocol's share of interest, part of `cash` but never lent or withdrawn by investors.
    uint256 public reserves;
    uint256 public reserveFactor = 20e16; // 20% of interest to reserves, 80% to investors

    uint256 public borrowIndex = WAD;
    uint256 public lastAccrual;
    uint256 public totalScaledDebt;

    uint256 public loanCount;
    mapping(uint256 => Loan) private s_loans;
    mapping(address => uint256[]) private s_borrowerLoans;
    uint256[] private s_activeLoans;
    mapping(uint256 => uint256) private s_activeIndex; // loanId => position + 1

    /// @notice Kilograms of each lot the pool owns outright, from reserve-funded liquidations.
    mapping(uint256 => uint256) public inventory;

    /// @notice Block of an investor's latest deposit; withdrawing in that same block is refused.
    mapping(address => uint256) public lastDepositBlock;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event LiquidityDeposited(address indexed investor, uint256 assets, uint256 sharesMinted, uint64 timestamp);
    event LiquidityWithdrawn(address indexed investor, uint256 assetsReturned, uint256 sharesBurned, uint64 timestamp);
    event LoanOpened(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 indexed lotId,
        uint256 principal,
        uint256 collateralKg,
        uint64 maturity
    );
    event LoanRepaid(uint256 indexed loanId, address indexed payer, uint256 amount, uint256 remainingDebt);
    event LoanLiquidated(
        uint256 indexed loanId,
        address indexed borrower,
        address indexed liquidator,
        uint256 debtRepaid,
        uint256 kgSeized,
        uint256 kgReturned,
        uint256 shortfall
    );
    event ReservesUsed(uint256 indexed loanId, uint256 amount);
    event ReservesDeposited(address indexed from, uint256 amount);
    event ReservesWithdrawn(address indexed to, uint256 amount);
    event InventoryReleased(uint256 indexed lotId, uint256 kg, address indexed to);
    event InterestAccrued(uint256 borrowIndex, uint256 interest, uint256 toReserves);
    event ReserveFactorUpdated(uint256 newFactor);

    /*//////////////////////////////////////////////////////////////
                             CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    error LendingPool__ZeroAddress();
    error LendingPool__ZeroAmount();
    error LendingPool__InvalidLoanBounds();
    error LendingPool__InsufficientPoolCash();
    error LendingPool__CommodityNotApprovedForBorrowing();
    error LendingPool__InvalidMaturity();
    error LendingPool__InsufficientCollateralBalance();
    error LendingPool__ExceedsMaxLTV();
    error LendingPool__LoanNotActive();
    error LendingPool__PositionHealthy();
    error LendingPool__LotFrozen();
    error LendingPool__InsufficientReserves();
    error LendingPool__InsufficientInventory();
    error LendingPool__SameBlockWithdrawal();
    error LendingPool__InvalidReserveFactor();
    error LendingPool__NativeTokenNotSupported();
    error LendingPool__InvalidCall();

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @param _admin Receives DEFAULT_ADMIN_ROLE: the AgriBridge Safe, or the deployer until handover.
     * @param _usdc USDC (6 decimals).
     * @param _registry CommodityRegistry: lot status, expiry and valuation factor.
     * @param _commodityToken CommodityToken (ERC-1155): the collateral.
     * @param _shareToken AgriShareToken: investors' agUSDC shares, minted and burned by this pool.
     * @param _priceOracle CommodityPriceOracle: USD per kilogram, 8 decimals.
     * @param _config CommodityConfig: each commodity's loan limit and liquidation point.
     */
    constructor(
        address _admin,
        address _usdc,
        address _registry,
        address _commodityToken,
        address _shareToken,
        address _priceOracle,
        address _config
    ) {
        if (
            _admin == address(0) || _usdc == address(0) || _registry == address(0) || _commodityToken == address(0)
                || _shareToken == address(0) || _priceOracle == address(0) || _config == address(0)
        ) {
            revert LendingPool__ZeroAddress();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);

        i_usdc = IERC20(_usdc);
        i_registry = ICommodityRegistry(_registry);
        i_commodityToken = ICommodityToken(_commodityToken);
        i_shareToken = AgriShareToken(_shareToken);
        i_priceOracle = ICommodityPriceOracle(_priceOracle);
        i_config = CommodityConfig(_config);

        lastAccrual = block.timestamp;
    }

    modifier nonZero(uint256 _amount) {
        if (_amount == 0) revert LendingPool__ZeroAmount();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                               INVESTORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Deposits USDC and mints agUSDC shares at the current share price.
    function deposit(uint256 _assets) external whenNotPaused nonReentrant nonZero(_assets) {
        _accrue();
        uint256 shares = convertToShares(_assets);
        if (shares == 0) revert LendingPool__ZeroAmount();

        i_usdc.safeTransferFrom(msg.sender, address(this), _assets);
        cash += _assets;
        lastDepositBlock[msg.sender] = block.number;
        i_shareToken.mintShares(msg.sender, shares);

        emit LiquidityDeposited(msg.sender, _assets, shares, uint64(block.timestamp));
    }

    /// @notice Burns agUSDC shares for their USDC, out of cash that is neither lent out nor reserves.
    function withdraw(uint256 _shares) external whenNotPaused nonReentrant nonZero(_shares) {
        if (lastDepositBlock[msg.sender] == block.number) revert LendingPool__SameBlockWithdrawal();
        _accrue();

        uint256 assets = convertToAssets(_shares);
        if (assets > availableCash()) revert LendingPool__InsufficientPoolCash();

        i_shareToken.burnShares(msg.sender, _shares);
        cash -= assets;
        i_usdc.safeTransfer(msg.sender, assets);

        emit LiquidityWithdrawn(msg.sender, assets, _shares, uint64(block.timestamp));
    }

    /*//////////////////////////////////////////////////////////////
                               BORROWERS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Borrows USDC against commodity tokens the caller holds, until `_maturity`.
     * @param _lotId Lot whose tokens back the loan.
     * @param _collateralKg Tokens to lock (18-decimal kilograms); part of a lot is fine.
     * @param _amount USDC to borrow (6 decimals).
     * @param _maturity When the loan should be repaid: at least MIN_LOAN_TERM away and at least
     *        MATURITY_BUFFER before the lot expires. The loan limit uses the lot's value at this date.
     */
    function borrow(uint256 _lotId, uint256 _collateralKg, uint256 _amount, uint64 _maturity)
        external
        whenNotPaused
        nonReentrant
        nonZero(_collateralKg)
        returns (uint256 loanId)
    {
        if (_amount < MIN_BORROW_AMOUNT || _amount > MAX_BORROW_AMOUNT) {
            revert LendingPool__InvalidLoanBounds();
        }
        _accrue();
        if (_amount > availableCash()) revert LendingPool__InsufficientPoolCash();
        if (!i_registry.isUsable(_lotId)) revert LendingPool__CommodityNotApprovedForBorrowing();
        if (_maturity < block.timestamp + MIN_LOAN_TERM || _maturity + MATURITY_BUFFER > i_registry.expiresAt(_lotId)) {
            revert LendingPool__InvalidMaturity();
        }
        if (i_commodityToken.balanceOf(msg.sender, _lotId) < _collateralKg) {
            revert LendingPool__InsufficientCollateralBalance();
        }
        if (_amount * BPS > _valueAt(_lotId, _collateralKg, _maturity) * _commodity(_lotId).maxLtvBps) {
            revert LendingPool__ExceedsMaxLTV();
        }

        loanId = ++loanCount;
        uint256 scaled = _toScaledUp(_amount);
        s_loans[loanId] = Loan({
            borrower: msg.sender,
            openedAt: uint64(block.timestamp),
            maturity: _maturity,
            status: LoanStatus.ACTIVE,
            lotId: _lotId,
            collateralKg: _collateralKg,
            principal: _amount,
            scaledDebt: scaled
        });
        s_borrowerLoans[msg.sender].push(loanId);
        _addActive(loanId);
        totalScaledDebt += scaled;
        cash -= _amount;

        i_commodityToken.safeTransferFrom(msg.sender, address(this), _lotId, _collateralKg, "");
        i_usdc.safeTransfer(msg.sender, _amount);

        emit LoanOpened(loanId, msg.sender, _lotId, _amount, _collateralKg, _maturity);
    }

    /**
     * @notice Repays a loan; anyone may pay. Amounts above the debt are capped at it, so
     *         `type(uint256).max` repays in full and returns the collateral to the borrower.
     * @dev Allowed while paused, so borrowers can always stop interest. The USDC is taken before
     *      any collateral moves.
     */
    function repay(uint256 _loanId, uint256 _amount) external nonReentrant nonZero(_amount) {
        _accrue();
        Loan storage loan = _activeLoan(_loanId);

        uint256 debt = _debt(loan.scaledDebt);
        uint256 payment = _amount > debt ? debt : _amount;

        i_usdc.safeTransferFrom(msg.sender, address(this), payment);
        cash += payment;

        uint256 scaledRepaid = payment == debt ? loan.scaledDebt : _toScaledDown(payment);
        loan.scaledDebt -= scaledRepaid;
        totalScaledDebt -= scaledRepaid;

        if (loan.scaledDebt == 0) {
            loan.status = LoanStatus.REPAID;
            _removeActive(_loanId);
            i_commodityToken.safeTransferFrom(address(this), loan.borrower, loan.lotId, loan.collateralKg, "");
        }

        emit LoanRepaid(_loanId, msg.sender, payment, _debt(loan.scaledDebt));
    }

    /*//////////////////////////////////////////////////////////////
                              LIQUIDATION
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Liquidates a loan past its liquidation point or overdue. The caller pays the debt in
     *         USDC and receives collateral worth the debt plus the 5% bonus; the rest of the
     *         collateral goes back to the borrower.
     */
    function liquidate(uint256 _loanId) external whenNotPaused nonReentrant {
        _accrue();
        Loan storage loan = _activeLoan(_loanId);
        (uint256 payment, uint256 seizedKg, uint256 shortfall) = _liquidationTerms(loan);

        i_usdc.safeTransferFrom(msg.sender, address(this), payment);
        cash += payment;
        _coverShortfall(_loanId, shortfall);
        _settleLiquidation(_loanId, loan, msg.sender, payment, seizedKg, shortfall);
    }

    /**
     * @notice The keeper's backstop: liquidates with protocol reserves instead of an outside buyer.
     *         Investors are repaid at once; the seized collateral becomes protocol inventory.
     */
    function liquidateWithReserves(uint256 _loanId) external whenNotPaused nonReentrant onlyRole(KEEPER_ROLE) {
        _accrue();
        Loan storage loan = _activeLoan(_loanId);
        (uint256 payment, uint256 seizedKg, uint256 shortfall) = _liquidationTerms(loan);

        // The debt is paid out of reserves: cash stays put, reserves become collateral inventory.
        if (payment > reserves) revert LendingPool__InsufficientReserves();
        reserves -= payment;
        emit ReservesUsed(_loanId, payment);

        _coverShortfall(_loanId, shortfall);
        inventory[loan.lotId] += seizedKg;
        _settleLiquidation(_loanId, loan, address(this), payment, seizedKg, shortfall);
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Adds USDC to reserves, e.g. the proceeds of selling inventory, or a backstop fund.
    function depositReserves(uint256 _amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonZero(_amount) {
        _accrue();
        i_usdc.safeTransferFrom(msg.sender, address(this), _amount);
        cash += _amount;
        reserves += _amount;
        emit ReservesDeposited(msg.sender, _amount);
    }

    /// @notice Moves reserves out, e.g. to an insurance fund.
    function withdrawReserves(address _to, uint256 _amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonZero(_amount) {
        _accrue();
        if (_amount > reserves || _amount > cash) revert LendingPool__InsufficientReserves();
        reserves -= _amount;
        cash -= _amount;
        i_usdc.safeTransfer(_to, _amount);
        emit ReservesWithdrawn(_to, _amount);
    }

    /// @notice Sends inventory tokens out to be sold (stock clearance).
    function releaseInventory(uint256 _lotId, uint256 _kg, address _to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_kg == 0 || _kg > inventory[_lotId]) revert LendingPool__InsufficientInventory();
        inventory[_lotId] -= _kg;
        i_commodityToken.safeTransferFrom(address(this), _to, _lotId, _kg, "");
        emit InventoryReleased(_lotId, _kg, _to);
    }

    function setReserveFactor(uint256 _newFactor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_newFactor > MAX_RESERVE_FACTOR) revert LendingPool__InvalidReserveFactor();
        _accrue();
        reserveFactor = _newFactor;
        emit ReserveFactorUpdated(_newFactor);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
                           POOL ACCOUNTING VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice What every loan owes now, interest included.
    function totalDebt() public view returns (uint256) {
        return (totalScaledDebt * _currentIndex()) / WAD;
    }

    /// @notice Investors' USDC: cash plus what borrowers owe, less protocol reserves.
    function totalAssets() public view returns (uint256) {
        (uint256 debt, uint256 pendingToReserves) = _pendingAccrual();
        uint256 gross = cash + debt;
        uint256 protocolShare = reserves + pendingToReserves;
        return gross > protocolShare ? gross - protocolShare : 0;
    }

    /// @notice Cash that can be lent or withdrawn: everything but reserves.
    function availableCash() public view returns (uint256) {
        return cash > reserves ? cash - reserves : 0;
    }

    function convertToShares(uint256 _assets) public view returns (uint256) {
        return (_assets * (i_shareToken.totalSupply() + VIRTUAL_SHARES)) / (totalAssets() + VIRTUAL_ASSETS);
    }

    function convertToAssets(uint256 _shares) public view returns (uint256) {
        return (_shares * (totalAssets() + VIRTUAL_ASSETS)) / (i_shareToken.totalSupply() + VIRTUAL_SHARES);
    }

    /// @notice Share of investors' USDC lent out, in WAD.
    function utilization() public view returns (uint256) {
        return _utilization(totalDebt());
    }

    /// @notice Annual borrow rate (WAD) from utilisation: 5% to 13% at the 80% kink, then steeply higher.
    function getBorrowRate() public view returns (uint256) {
        return _rate(totalDebt());
    }

    /// @notice Annual rate investors earn (WAD): the borrow rate times utilisation, less the reserve share.
    function getSupplyRate() external view returns (uint256) {
        return (((getBorrowRate() * utilization()) / WAD) * (WAD - reserveFactor)) / WAD;
    }

    /*//////////////////////////////////////////////////////////////
                               LOAN VIEWS
    //////////////////////////////////////////////////////////////*/

    function getLoan(uint256 _loanId) external view returns (Loan memory) {
        return s_loans[_loanId];
    }

    /// @notice What the loan owes now, interest included.
    function debtOf(uint256 _loanId) public view returns (uint256) {
        Loan storage loan = s_loans[_loanId];
        return loan.status == LoanStatus.ACTIVE ? _debt(loan.scaledDebt) : 0;
    }

    /// @notice Summary for dashboards: borrower, USDC borrowed, collateral, status and current debt.
    function getLoanDetails(uint256 _loanId)
        external
        view
        returns (address borrower, uint256 principal, uint256 collateralKg, LoanStatus status, uint256 debt)
    {
        Loan storage loan = s_loans[_loanId];
        return (loan.borrower, loan.principal, loan.collateralKg, loan.status, debtOf(_loanId));
    }

    function getBorrowerLoans(address _borrower) external view returns (uint256[] memory) {
        return s_borrowerLoans[_borrower];
    }

    /// @notice Every open loan, e.g. for the keeper to check.
    function activeLoanIds() external view returns (uint256[] memory) {
        return s_activeLoans;
    }

    /// @notice USD value (6 decimals) of `_quantity` tokens of a lot now: price x kg x decay x (1 - basis).
    function getCollateralValue(uint256 _lotId, uint256 _quantity) external view returns (uint256) {
        return _valueAt(_lotId, _quantity, block.timestamp);
    }

    /// @notice Most a borrower could take against `_kg` of a lot until `_maturity`.
    function maxBorrow(uint256 _lotId, uint256 _kg, uint64 _maturity) external view returns (uint256) {
        return (_valueAt(_lotId, _kg, _maturity) * _commodity(_lotId).maxLtvBps) / BPS;
    }

    /**
     * @notice Loan health in WAD: the collateral value at the liquidation point divided by the debt.
     *         Below 1e18 the loan can be liquidated. Zero for loans that are not active.
     */
    function getHealthFactor(uint256 _loanId) external view returns (uint256) {
        Loan storage loan = s_loans[_loanId];
        if (loan.status != LoanStatus.ACTIVE) return 0;
        uint256 debt = _debt(loan.scaledDebt);
        if (debt == 0) return type(uint256).max;
        uint256 value = _valueAt(loan.lotId, loan.collateralKg, block.timestamp);
        return (value * _commodity(loan.lotId).liquidationLtvBps * WAD) / (debt * BPS);
    }

    /// @notice True when the loan is past its liquidation point or GRACE_PERIOD past maturity.
    function isLiquidatable(uint256 _loanId) public view returns (bool) {
        Loan storage loan = s_loans[_loanId];
        if (loan.status != LoanStatus.ACTIVE) return false;
        if (block.timestamp > uint256(loan.maturity) + GRACE_PERIOD) return true;
        uint256 value = _valueAt(loan.lotId, loan.collateralKg, block.timestamp);
        return _debt(loan.scaledDebt) * BPS >= value * _commodity(loan.lotId).liquidationLtvBps;
    }

    /**
     * @notice Oracle price (USD per kilogram, 8 decimals) at which the loan reaches its liquidation
     *         point today, for "keep the price above X" warnings.
     */
    function liquidationPrice(uint256 _loanId) external view returns (uint256) {
        Loan storage loan = s_loans[_loanId];
        if (loan.status != LoanStatus.ACTIVE) return 0;
        uint256 factor = i_registry.valuationFactorBps(loan.lotId, block.timestamp);
        uint256 denominator = loan.collateralKg * factor * _commodity(loan.lotId).liquidationLtvBps;
        if (denominator == 0) return type(uint256).max;
        // debt = price * kg * factor * liqLtv / (1e20 * 1e4 * 1e4), solved for price.
        return (_debt(loan.scaledDebt) * PRICE_TO_USDC_SCALING * BPS * BPS) / denominator;
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL: LENDING
    //////////////////////////////////////////////////////////////*/

    function _activeLoan(uint256 _loanId) internal view returns (Loan storage loan) {
        loan = s_loans[_loanId];
        if (loan.status != LoanStatus.ACTIVE || loan.borrower == address(0)) revert LendingPool__LoanNotActive();
    }

    function _commodity(uint256 _lotId) internal view returns (CommodityConfig.Commodity memory) {
        return i_config.getCommodity(i_registry.commodityOf(_lotId));
    }

    /// @dev Value (6-decimal USD) of `_kg` of a lot at `_timestamp`'s decay, at today's fresh price.
    function _valueAt(uint256 _lotId, uint256 _kg, uint256 _timestamp) internal view returns (uint256) {
        uint256 price = i_priceOracle.getPriceFresh(i_registry.commodityOf(_lotId));
        uint256 factor = i_registry.valuationFactorBps(_lotId, _timestamp);
        return (price * _kg * factor) / (PRICE_TO_USDC_SCALING * BPS);
    }

    /**
     * @dev What a liquidation pays, seizes and leaves unpaid:
     *      - collateral worth more than debt x 1.05: pay the debt, take debt x 1.05 worth, the rest
     *        goes back to the borrower;
     *      - worth between the debt and debt x 1.05: pay the debt, take it all (a smaller bonus);
     *      - worth less than the debt: take it all for its value less the bonus; the rest of the debt
     *        is the shortfall, which reserves absorb.
     */
    function _liquidationTerms(Loan storage _loan)
        internal
        view
        returns (uint256 payment, uint256 seizedKg, uint256 shortfall)
    {
        if (i_registry.isFrozen(_loan.lotId)) revert LendingPool__LotFrozen();

        uint256 debt = _debt(_loan.scaledDebt);
        uint256 value = _valueAt(_loan.lotId, _loan.collateralKg, block.timestamp);
        bool overdue = block.timestamp > uint256(_loan.maturity) + GRACE_PERIOD;
        if (!overdue && debt * BPS < value * _commodity(_loan.lotId).liquidationLtvBps) {
            revert LendingPool__PositionHealthy();
        }

        uint256 claim = (debt * (BPS + LIQUIDATION_BONUS_BPS)) / BPS;
        if (value > claim) {
            payment = debt;
            seizedKg = (_loan.collateralKg * claim) / value;
        } else if (value >= debt) {
            payment = debt;
            seizedKg = _loan.collateralKg;
        } else {
            payment = (value * BPS) / (BPS + LIQUIDATION_BONUS_BPS);
            seizedKg = _loan.collateralKg;
            shortfall = debt - payment;
        }
    }

    /// @dev Reserves absorb bad debt first; anything beyond them falls on investors.
    function _coverShortfall(uint256 _loanId, uint256 _shortfall) internal {
        if (_shortfall == 0) return;
        uint256 covered = _shortfall > reserves ? reserves : _shortfall;
        if (covered > 0) {
            reserves -= covered;
            emit ReservesUsed(_loanId, covered);
        }
    }

    /// @dev Closes the loan, sends the seized collateral and returns the rest to the borrower.
    function _settleLiquidation(
        uint256 _loanId,
        Loan storage _loan,
        address _recipient,
        uint256 _payment,
        uint256 _seizedKg,
        uint256 _shortfall
    ) internal {
        totalScaledDebt -= _loan.scaledDebt;
        _loan.scaledDebt = 0;
        _loan.status = LoanStatus.LIQUIDATED;
        _removeActive(_loanId);

        uint256 returnedKg = _loan.collateralKg - _seizedKg;
        if (_recipient != address(this)) {
            i_commodityToken.safeTransferFrom(address(this), _recipient, _loan.lotId, _seizedKg, "");
        }
        if (returnedKg > 0) {
            i_commodityToken.safeTransferFrom(address(this), _loan.borrower, _loan.lotId, returnedKg, "");
        }

        emit LoanLiquidated(_loanId, _loan.borrower, _recipient, _payment, _seizedKg, returnedKg, _shortfall);
    }

    function _addActive(uint256 _loanId) internal {
        s_activeLoans.push(_loanId);
        s_activeIndex[_loanId] = s_activeLoans.length;
    }

    function _removeActive(uint256 _loanId) internal {
        uint256 position = s_activeIndex[_loanId] - 1;
        uint256 lastId = s_activeLoans[s_activeLoans.length - 1];
        s_activeLoans[position] = lastId;
        s_activeIndex[lastId] = position + 1;
        s_activeLoans.pop();
        delete s_activeIndex[_loanId];
    }

    /*//////////////////////////////////////////////////////////////
                          INTERNAL: INTEREST
    //////////////////////////////////////////////////////////////*/

    /// @dev Advances the borrow index and books the reserves' share of the interest it adds.
    function _accrue() internal {
        if (block.timestamp == lastAccrual) return;
        (uint256 newIndex, uint256 interest) = _projection();
        uint256 toReserves = (interest * reserveFactor) / WAD;

        borrowIndex = newIndex;
        reserves += toReserves;
        lastAccrual = block.timestamp;

        if (interest > 0) emit InterestAccrued(newIndex, interest, toReserves);
    }

    function _utilization(uint256 _owed) internal view returns (uint256) {
        uint256 liquidity = availableCash() + _owed;
        return liquidity == 0 ? 0 : (_owed * WAD) / liquidity;
    }

    function _rate(uint256 _owed) internal view returns (uint256) {
        uint256 u = _utilization(_owed);
        if (u <= KINK) return BASE_RATE + (u * SLOPE_BELOW_KINK) / WAD;
        return BASE_RATE + (KINK * SLOPE_BELOW_KINK) / WAD + ((u - KINK) * SLOPE_ABOVE_KINK) / WAD;
    }

    /**
     * @dev The index and the interest it would add if accrual ran now. The period since the last
     *      accrual earns the rate set by the utilisation at its start, from stored values.
     */
    function _projection() internal view returns (uint256 newIndex, uint256 interest) {
        uint256 elapsed = block.timestamp - lastAccrual;
        if (elapsed == 0 || totalScaledDebt == 0) return (borrowIndex, 0);

        uint256 storedDebt = (totalScaledDebt * borrowIndex) / WAD;
        uint256 growth = (_rate(storedDebt) * elapsed) / SECONDS_PER_YEAR;
        newIndex = borrowIndex + (borrowIndex * growth) / WAD;
        interest = (totalScaledDebt * (newIndex - borrowIndex)) / WAD;
    }

    function _currentIndex() internal view returns (uint256 index) {
        (index,) = _projection();
    }

    /// @dev Total debt and the reserves' share of interest not yet booked, as of now.
    function _pendingAccrual() internal view returns (uint256 debt, uint256 pendingToReserves) {
        (uint256 index, uint256 interest) = _projection();
        debt = (totalScaledDebt * index) / WAD;
        pendingToReserves = (interest * reserveFactor) / WAD;
    }

    function _debt(uint256 _scaled) internal view returns (uint256) {
        return (_scaled * _currentIndex()) / WAD;
    }

    /// @dev Scaled debt for a new loan, rounded up so the pool is never owed less than it lent.
    function _toScaledUp(uint256 _amount) internal view returns (uint256) {
        return (_amount * WAD + borrowIndex - 1) / borrowIndex;
    }

    /// @dev Scaled debt a partial repayment clears, rounded down in the pool's favour.
    function _toScaledDown(uint256 _amount) internal view returns (uint256) {
        return (_amount * WAD) / borrowIndex;
    }

    /*//////////////////////////////////////////////////////////////
                          INTERFACE SUPPORT
    //////////////////////////////////////////////////////////////*/

    /// @dev Both AccessControl and ERC1155Holder declare this, so the override must be explicit.
    function supportsInterface(bytes4 _interfaceId) public view override(AccessControl, ERC1155Holder) returns (bool) {
        return AccessControl.supportsInterface(_interfaceId) || ERC1155Holder.supportsInterface(_interfaceId);
    }

    receive() external payable {
        revert LendingPool__NativeTokenNotSupported();
    }

    fallback() external payable {
        revert LendingPool__InvalidCall();
    }
}
