// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {AgriShareToken} from "src/AgriShareToken.sol";

/*//////////////////////////////////////////////////////////////
                          INTERFACES
//////////////////////////////////////////////////////////////*/

/**
 * @notice Minimal interface for CommodityRegistry.
 * @dev Avoids circular imports and keeps concerns separated.
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

    function isApprovedForBorrowing(uint256 _commodityId) external view returns (bool);

    function markCollateralized(uint256 _commodityId) external;

    function updateStatus(uint256 _commodityId, uint8 _newStatus) external;
}

/**
 * @notice Interface for ERC1155 commodity token.
 * @dev Defines methods for collateral management and transfers.
 */
interface ICommodityToken {
    function balanceOf(address account, uint256 id) external view returns (uint256);

    function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes calldata data) external;

    function burn(address _from, uint256 _commodityId, uint256 _amount) external;
}

/**
 * @notice Interface for price oracle.
 * @dev Backend service is responsible for keeping this oracle updated.
 */
interface ICommodityPriceOracle {
    function getCollateralValue(uint256 commodityId, uint256 quantity) external view returns (uint256 usdValue);

    function getCommodityPrice(uint256 commodityId) external view returns (uint256 pricePerUnit);
}

/*//////////////////////////////////////////////////////////////
                         MAIN CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title LendingPool
 * @author ChijulyBuilds (AgriBridge Protocol Team)
 * @notice Core lending pool enabling farmers to borrow stablecoins against verified commodities.
 * @dev
 *      Architecture:
 *      - Investors deposit USDC → receive agUSDC (share tokens)
 *      - Farmers deposit ERC1155 commodity tokens as collateral
 *      - Farmers borrow USDC based on LTV ratio
 *      - Interest accrues to investor pool
 *      - Backend service monitors health factor and triggers liquidations
 *
 *      Role Flow:
 *      - Backend engineer (POOL_ROLE in CommodityRegistry) can call markCollateralized()
 *      - Admin can pause/unpause and manage reserve factor
 *      - Liquidators (open) can trigger liquidations when health factor < 1.0
 */
contract LendingPool is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                               CONSTANTS
    //////////////////////////////////////////////////////////////*/

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant LIQUIDATOR_ROLE = keccak256("LIQUIDATOR_ROLE");

    uint256 private constant INDEX_PRECISION = 1e18;
    uint256 private constant INTEREST_RATE_PRECISION = 1e18;

    // Interest rate model parameters (Kink-based)
    uint256 private constant BASE_INTEREST_RATE = 5e16; // 5% annual base rate
    uint256 private constant KINK_MULTIPLIER = 10e16; // 10% additional at kink
    uint256 private constant HIGH_UTIL_MULTIPLIER = 50e16; // 50% additional above kink
    uint256 private constant UTILIZATION_KINK = 80e16; // 80% utilization kink point

    // Liquidation & collateral parameters
    uint256 private constant LIQUIDATION_THRESHOLD = 1e18; // 1.0 health factor
    uint256 private constant LIQUIDATION_BONUS = 5e16; // 5% liquidator bonus
    uint256 private constant MAX_LTV = 70e16; // 70% max loan-to-value

    // Borrow bounds
    uint256 private constant MIN_BORROW_AMOUNT = 100e6; // $100 minimum (USDC: 6 decimals)
    uint256 private constant MAX_BORROW_AMOUNT = 10_000_000e6; // $10M maximum

    // Accrual parameters
    uint256 private constant SECONDS_PER_YEAR = 365 days;

    /*//////////////////////////////////////////////////////////////
                              ENUMS
    //////////////////////////////////////////////////////////////*/

    enum LoanStatus {
        ACTIVE,
        REPAID,
        LIQUIDATED
    }

    /*//////////////////////////////////////////////////////////////
                              STRUCTS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Loan record tracking principal, collateral, and accrual state.
     */
    struct Loan {
        uint256 principal;
        uint256 interestIndex;
        uint256 commodityId;
        uint256 collateralAmount;
        uint64 openedAt;
        uint64 lastAccruedAt;
        LoanStatus status;
        address farmer;
    }

    /*//////////////////////////////////////////////////////////////
                              IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice USDC stablecoin (collateral currency)
    IERC20 public immutable i_usdc;

    /// @notice CommodityRegistry contract (commodity validation)
    ICommodityRegistry public immutable i_registry;

    /// @notice CommodityToken ERC1155 (collateral token)
    ICommodityToken public immutable i_commodityToken;

    /// @notice agUSDC share token (investor receipts)
    AgriShareToken public immutable i_shareToken;

    /// @notice Price oracle (for collateral valuation)
    ICommodityPriceOracle public immutable i_priceOracle;

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    // Lending pool state
    uint256 public totalBorrowed;
    uint256 public totalAccumulatedReserves;
    uint256 public reserveFactor = 20e16; // 20% to protocol reserves, 80% to LPs

    // Interest accrual
    uint256 public globalBorrowIndex;
    uint256 public lastGlobalAccrualTimestamp;

    // Loans
    uint256 public loanCount;
    mapping(uint256 => Loan) public loans;
    mapping(address => uint256[]) private s_farmerLoans;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event LiquidityDeposited(address indexed investor, uint256 assets, uint256 sharesMinted, uint64 timestamp);
    event LiquidityWithdrawn(address indexed investor, uint256 assetsReturned, uint256 sharesBurned, uint64 timestamp);

    event LoanOpened(
        uint256 indexed loanId,
        address indexed farmer,
        uint256 indexed commodityId,
        uint256 principal,
        uint256 collateralAmount,
        uint64 timestamp
    );

    event LoanRepaid(
        uint256 indexed loanId,
        address indexed farmer,
        uint256 principalPaid,
        uint256 interestPaid,
        uint256 remainingPrincipal,
        uint64 timestamp
    );

    event LoanLiquidated(
        uint256 indexed loanId,
        address indexed farmer,
        address indexed liquidator,
        uint256 debtCovered,
        uint256 collateralSeized,
        uint256 liquidatorBonus,
        uint64 timestamp
    );

    event CommodityCollateralized(uint256 indexed commodityId, uint256 indexed loanId, uint64 timestamp);

    event GlobalIndexUpdated(uint256 newIndex, uint256 totalReserves, uint64 timestamp);

    event ReserveFactorUpdated(uint256 newFactor, uint64 timestamp);

    /*//////////////////////////////////////////////////////////////
                             CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    error LendingPool__UnauthorizedAccess();
    error LendingPool__ZeroAddress();
    error LendingPool__ZeroAmount();
    error LendingPool__InvalidLoanBounds();
    error LendingPool__InsufficientPoolCash();
    error LendingPool__CommodityNotVerified();
    error LendingPool__CommodityNotApprovedForBorrowing();
    error LendingPool__Unauthorized();
    error LendingPool__InsufficientCollateralBalance();
    error LendingPool__ExceedsMaxLTV();
    error LendingPool__LoanNotActive();
    error LendingPool__RepaymentExceedsDebt();
    error LendingPool__PositionHealthy();
    error LendingPool__NativeTokenNotSupported();
    error LendingPool__InvalidCall();
    error LendingPool__InvalidReserveFactor();

    /*//////////////////////////////////////////////////////////////
                             MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier checkZeroAmount(uint256 _amount) {
        if (_amount == 0) revert LendingPool__ZeroAmount();
        _;
    }

    modifier onlyAdmin() {
        if (!hasRole(ADMIN_ROLE, msg.sender)) revert LendingPool__UnauthorizedAccess();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Initializes the LendingPool with all external contract references.
     * @param _admin Backend engineer's wallet (receives ADMIN_ROLE).
     * @param _usdc USDC token address.
     * @param _registry CommodityRegistry contract address.
     * @param _commodityToken CommodityToken (ERC1155) contract address.
     * @param _shareToken AgriShareToken contract address.
     * @param _priceOracle CommodityPriceOracle contract address.
     */
    constructor(
        address _admin,
        address _usdc,
        address _registry,
        address _commodityToken,
        address _shareToken,
        address _priceOracle
    ) {
        if (
            _admin == address(0) || _usdc == address(0) || _registry == address(0) || _commodityToken == address(0)
                || _shareToken == address(0) || _priceOracle == address(0)
        ) {
            revert LendingPool__ZeroAddress();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(LIQUIDATOR_ROLE, _admin); // Backend can liquidate initially

        i_usdc = IERC20(_usdc);
        i_registry = ICommodityRegistry(_registry);
        i_commodityToken = ICommodityToken(_commodityToken);
        i_shareToken = AgriShareToken(_shareToken);
        i_priceOracle = ICommodityPriceOracle(_priceOracle);

        globalBorrowIndex = INDEX_PRECISION;
        lastGlobalAccrualTimestamp = block.timestamp;
    }

    /*//////////////////////////////////////////////////////////////
                       INVESTOR FUNCTIONS (LP)
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Deposit USDC liquidity into the pool to earn yield via agUSDC shares.
     * @dev Called by investors. Mints agUSDC proportional to contribution.
     * @param _assets Amount of USDC to deposit.
     */
    function deposit(uint256 _assets) external whenNotPaused nonReentrant checkZeroAmount(_assets) {
        _accrueGlobalInterest();

        uint256 sharesToMint = _convertToShares(_assets);

        i_shareToken.mintShares(msg.sender, sharesToMint);
        i_usdc.safeTransferFrom(msg.sender, address(this), _assets);

        emit LiquidityDeposited(msg.sender, _assets, sharesToMint, uint64(block.timestamp));
    }

    /**
     * @notice Redeem agUSDC shares to withdraw USDC plus accrued yield.
     * @dev Shares are burned, proportional USDC returned.
     * @param _shares Amount of agUSDC to burn.
     */
    function withdraw(uint256 _shares) external whenNotPaused nonReentrant checkZeroAmount(_shares) {
        _accrueGlobalInterest();

        uint256 assetsToReturn = _convertToAssets(_shares);
        if (assetsToReturn > i_usdc.balanceOf(address(this))) {
            revert LendingPool__InsufficientPoolCash();
        }

        i_shareToken.burnShares(msg.sender, _shares);
        i_usdc.safeTransfer(msg.sender, assetsToReturn);

        emit LiquidityWithdrawn(msg.sender, assetsToReturn, _shares, uint64(block.timestamp));
    }

    /*//////////////////////////////////////////////////////////////
                       FARMER FUNCTIONS (BORROWER)
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Borrow USDC against ERC1155 commodity collateral.
     * @dev
     *      Workflow:
     *      1. Farmer calls CommodityToken.approve() to allow pool to transfer tokens
     *      2. Backend calls CommodityRegistry.approveCommodity(commodityId) → mints tokens to farmer
     *      3. Farmer calls this function to borrow
     *      4. Collateral is transferred from farmer to pool
     *      5. USDC is transferred to farmer
     *      6. Backend calls markCollateralized() to sync registry status
     *
     * @param _commodityId The commodity to use as collateral.
     * @param _collateralAmount Amount of commodity tokens to lock as collateral.
     * @param _borrowAmount Amount of USDC to borrow.
     * @return loanId The newly created loan ID.
     */
    function borrow(uint256 _commodityId, uint256 _collateralAmount, uint256 _borrowAmount)
        external
        whenNotPaused
        nonReentrant
        checkZeroAmount(_borrowAmount)
        returns (uint256 loanId)
    {
        // Validate borrow amount bounds
        if (_borrowAmount < MIN_BORROW_AMOUNT || _borrowAmount > MAX_BORROW_AMOUNT) {
            revert LendingPool__InvalidLoanBounds();
        }

        // Check pool has enough cash
        if (_borrowAmount > i_usdc.balanceOf(address(this))) {
            revert LendingPool__InsufficientPoolCash();
        }

        _accrueGlobalInterest();

        // Validate commodity is verified and approved for borrowing
        if (!i_registry.isApprovedForBorrowing(_commodityId)) {
            revert LendingPool__CommodityNotApprovedForBorrowing();
        }

        // Get commodity details
        (address farmer,,,,,,,,,,) = i_registry.getCommodity(_commodityId);

        // Only the farmer who submitted this commodity can borrow against it
        if (farmer != msg.sender) revert LendingPool__Unauthorized();

        // Verify farmer has sufficient token balance
        if (i_commodityToken.balanceOf(msg.sender, _commodityId) < _collateralAmount) {
            revert LendingPool__InsufficientCollateralBalance();
        }

        // Validate LTV: (borrow amount) / (collateral USD value) <= MAX_LTV
        uint256 collateralUSDValue = i_priceOracle.getCollateralValue(_commodityId, _collateralAmount);
        uint256 calculatedLTV = (_borrowAmount * INDEX_PRECISION) / collateralUSDValue;
        if (calculatedLTV > MAX_LTV) {
            revert LendingPool__ExceedsMaxLTV();
        }

        // Create loan record
        unchecked {
            loanId = ++loanCount;
        }

        loans[loanId] = Loan({
            principal: _borrowAmount,
            interestIndex: globalBorrowIndex,
            commodityId: _commodityId,
            collateralAmount: _collateralAmount,
            openedAt: uint64(block.timestamp),
            lastAccruedAt: uint64(block.timestamp),
            status: LoanStatus.ACTIVE,
            farmer: msg.sender
        });

        s_farmerLoans[msg.sender].push(loanId);
        totalBorrowed += _borrowAmount;

        // Transfer collateral from farmer to pool
        i_commodityToken.safeTransferFrom(msg.sender, address(this), _commodityId, _collateralAmount, "");

        // Transfer USDC from pool to farmer
        i_usdc.safeTransfer(msg.sender, _borrowAmount);

        emit LoanOpened(loanId, msg.sender, _commodityId, _borrowAmount, _collateralAmount, uint64(block.timestamp));
    }

    /**
     * @notice Repay loan principal + accrued interest.
     * @dev Interest accrues linearly. Paying back early reduces interest.
     * @param _loanId The loan to repay.
     * @param _repayAmount Amount of USDC to repay.
     */
    function repay(uint256 _loanId, uint256 _repayAmount)
        external
        whenNotPaused
        nonReentrant
        checkZeroAmount(_repayAmount)
    {
        _accrueGlobalInterest();

        Loan storage loan = loans[_loanId];
        if (loan.status != LoanStatus.ACTIVE) revert LendingPool__LoanNotActive();

        // Calculate total debt (principal + accrued interest)
        uint256 totalDebt = _calculateCurrentDebt(loan);

        // Prevent overpayment
        if (_repayAmount > totalDebt) revert LendingPool__RepaymentExceedsDebt();

        // Split repayment between principal and interest
        uint256 interestPortion = totalDebt - loan.principal;
        uint256 interestPaid;
        uint256 principalPaid;

        if (_repayAmount <= interestPortion) {
            interestPaid = _repayAmount;
            principalPaid = 0;
        } else {
            interestPaid = interestPortion;
            principalPaid = _repayAmount - interestPortion;
        }

        // Update loan state
        loan.principal = totalDebt - _repayAmount;
        loan.interestIndex = globalBorrowIndex;
        loan.lastAccruedAt = uint64(block.timestamp);

        totalBorrowed -= principalPaid;

        // If fully repaid, return collateral
        if (loan.principal == 0) {
            loan.status = LoanStatus.REPAID;
            i_commodityToken.safeTransferFrom(address(this), loan.farmer, loan.commodityId, loan.collateralAmount, "");
        }

        // Receive repayment from farmer
        i_usdc.safeTransferFrom(msg.sender, address(this), _repayAmount);

        emit LoanRepaid(_loanId, loan.farmer, principalPaid, interestPaid, loan.principal, uint64(block.timestamp));
    }

    /*//////////////////////////////////////////////////////////////
                      LIQUIDATION FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Liquidate undercollateralized loan when health factor < 1.0.
     * @dev Only LIQUIDATOR_ROLE can call (typically backend service).
     *      Liquidator receives collateral + bonus.
     * @param _loanId The loan to liquidate.
     */
    function liquidate(uint256 _loanId) external onlyRole(LIQUIDATOR_ROLE) whenNotPaused nonReentrant {
        _accrueGlobalInterest();

        Loan storage loan = loans[_loanId];
        if (loan.status != LoanStatus.ACTIVE) revert LendingPool__LoanNotActive();

        // Check health factor is below threshold
        uint256 healthFactor = getHealthFactor(_loanId);
        if (healthFactor >= LIQUIDATION_THRESHOLD) {
            revert LendingPool__PositionHealthy();
        }

        // Calculate debt to cover
        uint256 debtToCover = _calculateCurrentDebt(loan);

        // Calculate liquidator bonus
        uint256 bonusAmount = (loan.collateralAmount * LIQUIDATION_BONUS) / INDEX_PRECISION;

        // Mark loan as liquidated
        loan.status = LoanStatus.LIQUIDATED;
        totalBorrowed -= loan.principal;

        // Liquidator pays debt
        i_usdc.safeTransferFrom(msg.sender, address(this), debtToCover);

        // Liquidator receives collateral + bonus
        uint256 totalCollateralToLiquidator = loan.collateralAmount + bonusAmount;
        i_commodityToken.safeTransferFrom(address(this), msg.sender, loan.commodityId, totalCollateralToLiquidator, "");

        emit LoanLiquidated(
            _loanId, loan.farmer, msg.sender, debtToCover, loan.collateralAmount, bonusAmount, uint64(block.timestamp)
        );
    }

    /*//////////////////////////////////////////////////////////////
                    BACKEND SYNCHRONIZATION
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Mark commodity as collateralized in registry after successful borrow.
     * @dev Only ADMIN_ROLE (backend) can call.
     *      Called by backend after verifying borrow transaction on-chain.
     * @param _loanId The loan ID (maps to commodity).
     */
    function syncCollateralizedStatus(uint256 _loanId) external onlyAdmin {
        Loan storage loan = loans[_loanId];
        if (loan.status != LoanStatus.ACTIVE) revert LendingPool__LoanNotActive();

        // Notify registry that this commodity is now collateralized
        i_registry.markCollateralized(loan.commodityId);

        emit CommodityCollateralized(loan.commodityId, _loanId, uint64(block.timestamp));
    }

    /*//////////////////////////////////////////////////////////////
                            INTEREST ENGINE
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Accrues interest globally using linear interest model.
     *      Updates globalBorrowIndex proportional to time elapsed and borrow rate.
     */
    function _accrueGlobalInterest() internal {
        uint256 timeElapsed = block.timestamp - lastGlobalAccrualTimestamp;
        if (timeElapsed == 0) return;

        uint256 rate = getBorrowRate();
        uint256 interestFactor = (rate * timeElapsed) / SECONDS_PER_YEAR;

        uint256 totalInterestAccrued = (totalBorrowed * interestFactor) / INTEREST_RATE_PRECISION;

        if (totalInterestAccrued > 0) {
            uint256 protocolReservePortion = (totalInterestAccrued * reserveFactor) / INDEX_PRECISION;
            totalAccumulatedReserves += protocolReservePortion;

            globalBorrowIndex += (globalBorrowIndex * interestFactor) / INTEREST_RATE_PRECISION;
        }

        lastGlobalAccrualTimestamp = uint64(block.timestamp);
        emit GlobalIndexUpdated(globalBorrowIndex, totalAccumulatedReserves, uint64(block.timestamp));
    }

    /**
     * @dev Calculates current debt including accrued interest.
     */
    function _calculateCurrentDebt(Loan memory _loan) internal view returns (uint256) {
        return (_loan.principal * globalBorrowIndex) / _loan.interestIndex;
    }

    /**
     * @dev Converts USDC assets to agUSDC shares.
     */
    function _convertToShares(uint256 _assets) internal view returns (uint256) {
        uint256 supply = i_shareToken.totalSupply();
        return (supply == 0) ? _assets : (_assets * supply) / totalAssets();
    }

    /**
     * @dev Converts agUSDC shares to USDC assets.
     */
    function _convertToAssets(uint256 _shares) internal view returns (uint256) {
        uint256 supply = i_shareToken.totalSupply();
        return (supply == 0) ? _shares : (_shares * totalAssets()) / supply;
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Total USDC assets under pool custody.
     */
    function totalAssets() public view returns (uint256) {
        return (i_usdc.balanceOf(address(this)) + totalBorrowed) - totalAccumulatedReserves;
    }

    /**
     * @notice Current borrow interest rate (annualized, scaled 1e18).
     * @dev Implements kink-based model:
     *      - Below kink (80%): 5% base + 10% * utilization
     *      - Above kink: 5% + 8% + 50% * (utilization - kink)
     */
    function getBorrowRate() public view returns (uint256) {
        uint256 poolCash = i_usdc.balanceOf(address(this));
        uint256 totalLiquidity = poolCash + totalBorrowed;

        if (totalLiquidity == 0) return BASE_INTEREST_RATE;

        uint256 utilization = (totalBorrowed * INTEREST_RATE_PRECISION) / totalLiquidity;

        if (utilization <= UTILIZATION_KINK) {
            return BASE_INTEREST_RATE + ((utilization * KINK_MULTIPLIER) / INTEREST_RATE_PRECISION);
        } else {
            uint256 excessUtil = utilization - UTILIZATION_KINK;
            return BASE_INTEREST_RATE + (8e16) + ((excessUtil * HIGH_UTIL_MULTIPLIER) / INTEREST_RATE_PRECISION);
        }
    }

    /**
     * @notice Health factor for a loan (collateral USD value / current debt).
     * @dev Health factor > 1.0 = safe, < 1.0 = liquidatable.
     */
    function getHealthFactor(uint256 _loanId) public view returns (uint256) {
        Loan memory loan = loans[_loanId];
        if (loan.status != LoanStatus.ACTIVE) return 0;

        uint256 collateralUSDValue = i_priceOracle.getCollateralValue(loan.commodityId, loan.collateralAmount);
        uint256 currentDebt = _calculateCurrentDebt(loan);

        if (currentDebt == 0) return type(uint256).max;
        return (collateralUSDValue * INDEX_PRECISION) / currentDebt;
    }

    /**
     * @notice Get all loans for a farmer.
     */
    function getFarmerLoans(address _farmer) external view returns (uint256[] memory) {
        return s_farmerLoans[_farmer];
    }

    /**
     * @notice Get detailed loan information.
     */
    function getLoanDetails(uint256 _loanId)
        external
        view
        returns (address farmer, uint256 principal, uint256 collateralAmount, LoanStatus status, uint256 totalDebt)
    {
        Loan memory loan = loans[_loanId];
        return (loan.farmer, loan.principal, loan.collateralAmount, loan.status, _calculateCurrentDebt(loan));
    }

    /*//////////////////////////////////////////////////////////////
                          ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Set protocol reserve factor (% of interest going to reserves vs LPs).
     * @param _newFactor New reserve factor (scaled 1e18, max 50%).
     */
    function setReserveFactor(uint256 _newFactor) external onlyAdmin {
        if (_newFactor > 50e16) revert LendingPool__InvalidReserveFactor(); // Max 50%

        reserveFactor = _newFactor;
        emit ReserveFactorUpdated(_newFactor, uint64(block.timestamp));
    }

    /**
     * @notice Grant liquidator role (typically backend monitoring service).
     */
    function grantLiquidatorRole(address _liquidator) external onlyAdmin {
        grantRole(LIQUIDATOR_ROLE, _liquidator);
    }

    /**
     * @notice Pause all pool operations.
     */
    function pause() external onlyAdmin {
        _pause();
    }

    /**
     * @notice Resume pool operations.
     */
    function unpause() external onlyAdmin {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
                    DEFENSIVE FALLBACK HANDLERS
    //////////////////////////////////////////////////////////////*/

    receive() external payable {
        revert LendingPool__NativeTokenNotSupported();
    }

    fallback() external payable {
        revert LendingPool__InvalidCall();
    }
}
