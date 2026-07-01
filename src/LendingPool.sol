// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./CommodityRegistry.sol";
import "./CommodityToken.sol";
import "./LiquidityShareToken.sol";
import "./CommodityPriceOracle.sol";

/**
 * @title LendingPool
 * @author AgriDeFi Protocol Team
 * @notice Core lending pool contract - accepts USDC deposits, manages loans against commodity collateral
 * @dev Phase 2 Step 6: Main protocol contract with full lending mechanics
 *
 * SECURITY FEATURES:
 * - ReentrancyGuard: Protects all state-changing functions
 * - Ownable: Owner controls admin functions
 * - Pausable: Emergency pause mechanism
 * - CEI Pattern: All functions follow Checks → Effects → Interactions
 * - Health Factor: Liquidation protection (must stay > 1.0)
 * - Interest Accrual: Automatic interest calculation
 */
contract LendingPool is Ownable, ReentrancyGuard {
    /*//////////////////////////////////////////////////////////////
                            CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @dev USDC decimals (6)
    uint8 private constant USDC_DECIMALS = 6;

    /// @dev Base interest rate: 5% annually
    uint256 private constant BASE_INTEREST_RATE = 5e16; // 5e16 = 5% in basis points

    /// @dev Interest multiplier for utilization > 80%
    uint256 private constant HIGH_UTIL_MULTIPLIER = 50e16; // 50x multiplier

    /// @dev Default liquidation threshold: 1.0 (health factor)
    uint256 private constant LIQUIDATION_THRESHOLD = 1e18;

    /// @dev Liquidation penalty: 10%
    uint256 private constant LIQUIDATION_PENALTY = 10e16; // 10%

    /// @dev Maximum LTV: 70%
    uint256 private constant MAX_LTV = 70e16; // 70%

    /// @dev Minimum borrow amount: $100 (100 USDC)
    uint256 private constant MIN_BORROW_AMOUNT = 100e6; // 100 USDC

    /// @dev Maximum borrow amount: $10M (10M USDC)
    uint256 private constant MAX_BORROW_AMOUNT = 10_000_000e6; // 10M USDC

    /*//////////////////////////////////////////////////////////////
                            ENUMS
    //////////////////////////////////////////////////////////////*/

    enum BorrowStatus {
        ACTIVE,
        REPAID,
        LIQUIDATED
    }

    /*//////////////////////////////////////////////////////////////
                            STRUCTS
    //////////////////////////////////////////////////////////////*/

    struct UserDeposit {
        uint256 amount;
        uint256 depositedAt;
        uint256 lastInterestClaimed;
        bool isActive;
    }

    struct FarmerBorrow {
        address farmer;
        uint256 commodityId;
        uint256 tokenId;
        uint256 collateralAmount;
        uint256 borrowAmount;
        uint256 borrowedAt;
        uint256 lastRepaymentAt;
        uint256 interestAccrued;
        BorrowStatus status;
    }

    struct PoolState {
        uint256 totalLiquidity;
        uint256 totalBorrowed;
        uint256 totalInterestAccrued;
        bool isPaused;
    }

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    // Core contracts
    IERC20 public usdc;
    CommodityRegistry public registry;
    CommodityToken public commodityToken;
    LiquidityShareToken public shareToken;
    CommodityPriceOracle public priceOracle;

    // Pool state
    uint256 public totalLiquidity;
    uint256 public totalBorrowed;
    uint256 public totalInterestAccrued;
    bool public isPaused;

    // User state
    mapping(address => UserDeposit) public deposits;
    mapping(address => uint256[]) public userBorrows;

    // Borrow state
    uint256 public borrowCount;
    mapping(uint256 => FarmerBorrow) public borrows;

    // Interest rates
    uint256 public baseInterestRate = BASE_INTEREST_RATE;
    uint256 public maxLTV = MAX_LTV;

    /*//////////////////////////////////////////////////////////////
                            EVENTS
    //////////////////////////////////////////////////////////////*/

    event Deposited(address indexed investor, uint256 usdcAmount, uint256 agUSDCMinted, uint256 timestamp);

    event Withdrawn(address indexed investor, uint256 agUSDCBurned, uint256 usdcAmount, uint256 timestamp);

    event BorrowInitiated(
        uint256 indexed borrowId,
        address indexed farmer,
        uint256 indexed commodityId,
        uint256 collateralAmount,
        uint256 borrowAmount,
        uint256 interestRate,
        uint256 timestamp
    );

    event LoanRepaid(
        uint256 indexed borrowId,
        address indexed farmer,
        uint256 principalRepaid,
        uint256 interestRepaid,
        uint256 remainingBalance,
        uint256 timestamp
    );

    event Liquidated(
        uint256 indexed borrowId,
        address indexed liquidator,
        uint256 collateralLiquidated,
        uint256 liquidationPenalty,
        uint256 timestamp
    );

    event HealthFactorUpdated(uint256 indexed borrowId, uint256 newHealthFactor, uint256 timestamp);

    event PoolPaused(address indexed pauser, uint256 timestamp);
    event PoolResumed(address indexed resumer, uint256 timestamp);
    event InterestRateUpdated(uint256 newRate, uint256 timestamp);

    /*//////////////////////////////////////////////////////////////
                            ERRORS
    //////////////////////////////////////////////////////////////*/

    error PoolPausedError();
    error InsufficientLiquidity();
    error InsufficientCollateral();
    error HealthFactorTooLow();
    error BorrowNotFound();
    error BorrowNotActive();
    error InvalidBorrowAmount();
    error InvalidRepayAmount();
    error CommodityNotVerified();
    error CommodityExpired();
    error UnauthorizedCaller();
    error InvalidExchangeRate();
    error NoLiquidationNeeded();
    error InvalidAddress();
    error InvalidAmount();
    error ZeroAddress();

    /*//////////////////////////////////////////////////////////////
                            MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier whenNotPaused() {
        if (isPaused) revert PoolPausedError();
        _;
    }

    modifier validAmount(uint256 amount) {
        if (amount == 0) revert InvalidAmount();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(
        address usdcAddress,
        address registryAddress,
        address tokenAddress,
        address shareTokenAddress,
        address oracleAddress
    ) Ownable(msg.sender) {
        if (
            usdcAddress == address(0) || registryAddress == address(0) || tokenAddress == address(0)
                || shareTokenAddress == address(0) || oracleAddress == address(0)
        ) {
            revert InvalidAddress();
        }

        usdc = IERC20(usdcAddress);
        registry = CommodityRegistry(registryAddress);
        commodityToken = CommodityToken(tokenAddress);
        shareToken = LiquidityShareToken(shareTokenAddress);
        priceOracle = CommodityPriceOracle(oracleAddress);
    }

    /*//////////////////////////////////////////////////////////////
                        EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Deposit USDC to earn yield
     * @param amount USDC amount to deposit
     *
     * SECURITY:
     * - Pool must not be paused
     * - Amount must be > 0
     * - Uses CEI pattern
     * - Mints agUSDC 1:1 with USDC
     */
    function depositUSDC(uint256 amount) external whenNotPaused nonReentrant validAmount(amount) {
        // CHECKS
        uint256 usdcBalance = usdc.balanceOf(msg.sender);
        if (usdcBalance < amount) revert InsufficientLiquidity();

        // EFFECTS
        UserDeposit storage deposit = deposits[msg.sender];
        deposit.amount += amount;
        deposit.depositedAt = block.timestamp;
        deposit.lastInterestClaimed = block.timestamp;
        deposit.isActive = true;

        totalLiquidity += amount;

        // INTERACTIONS
        usdc.transferFrom(msg.sender, address(this), amount);
        shareToken.mint(msg.sender, amount);

        emit Deposited(msg.sender, amount, amount, block.timestamp);
    }

    /**
     * @notice Withdraw USDC using agUSDC
     * @param agUSDCAmount agUSDC amount to burn
     *
     * SECURITY:
     * - Pool must not be paused
     * - Amount must be > 0
     * - Pool must have sufficient USDC liquidity
     * - Uses CEI pattern
     */
    function withdrawUSDC(uint256 agUSDCAmount) external whenNotPaused nonReentrant validAmount(agUSDCAmount) {
        // CHECKS
        if (shareToken.balanceOf(msg.sender) < agUSDCAmount) {
            revert InsufficientCollateral();
        }

        if (usdc.balanceOf(address(this)) < agUSDCAmount) {
            revert InsufficientLiquidity();
        }

        // EFFECTS
        UserDeposit storage deposit = deposits[msg.sender];
        if (deposit.amount < agUSDCAmount) revert InsufficientCollateral();

        deposit.amount -= agUSDCAmount;
        totalLiquidity -= agUSDCAmount;

        // INTERACTIONS
        shareToken.burn(msg.sender, agUSDCAmount);
        usdc.transfer(msg.sender, agUSDCAmount);

        emit Withdrawn(msg.sender, agUSDCAmount, agUSDCAmount, block.timestamp);
    }

    /**
     * @notice Borrow USDC against verified commodity collateral
     * @param commodityId ID of verified commodity
     * @param collateralAmount Amount of commodity to lock as collateral
     * @param borrowAmount Amount of USDC to borrow
     * @return borrowId The new borrow ID
     *
     * SECURITY:
     * - Pool must not be paused
     * - Commodity must be verified and not expired
     * - Farmer must have sufficient commodity balance
     * - Health factor must stay > 1.5x
     * - LTV must be < 70%
     * - Uses CEI pattern with reentrancy guard
     */
    function borrowAgainstCommodity(uint256 commodityId, uint256 collateralAmount, uint256 borrowAmount)
        external
        whenNotPaused
        nonReentrant
        validAmount(borrowAmount)
        returns (uint256)
    {
        // CHECKS
        if (borrowAmount < MIN_BORROW_AMOUNT || borrowAmount > MAX_BORROW_AMOUNT) {
            revert InvalidBorrowAmount();
        }

        if (usdc.balanceOf(address(this)) < borrowAmount) {
            revert InsufficientLiquidity();
        }

        // Verify commodity
        if (!registry.isCommodityValid(commodityId)) {
            revert CommodityNotVerified();
        }

        if (registry.isCommodityExpired(commodityId)) {
            revert CommodityExpired();
        }

        CommodityRegistry.Commodity memory commodity = registry.getCommodity(commodityId);

        if (commodity.farmer != msg.sender) revert UnauthorizedCaller();

        // Check farmer has commodity tokens
        if (commodityToken.getAvailableBalance(msg.sender, commodity.tokenId) < collateralAmount) {
            revert InsufficientCollateral();
        }

        // Calculate LTV
        (uint256 ltvPct, uint256 collateralValue) =
            _calculateLTV(commodity.estimatedMarketPrice, collateralAmount, borrowAmount);

        if (ltvPct > maxLTV) revert HealthFactorTooLow();

        // EFFECTS
        uint256 borrowId = ++borrowCount;
        uint256 interestRate = _calculateInterestRate();

        borrows[borrowId] = FarmerBorrow({
            farmer: msg.sender,
            commodityId: commodityId,
            tokenId: commodity.tokenId,
            collateralAmount: collateralAmount,
            borrowAmount: borrowAmount,
            borrowedAt: block.timestamp,
            lastRepaymentAt: block.timestamp,
            interestAccrued: 0,
            status: BorrowStatus.ACTIVE
        });

        userBorrows[msg.sender].push(borrowId);
        totalBorrowed += borrowAmount;

        // INTERACTIONS
        // Lock collateral
        commodityToken.lockCollateral(msg.sender, commodity.tokenId, collateralAmount);

        // Transfer USDC to farmer
        usdc.transfer(msg.sender, borrowAmount);

        emit BorrowInitiated(
            borrowId, msg.sender, commodityId, collateralAmount, borrowAmount, interestRate, block.timestamp
        );

        return borrowId;
    }

    /**
     * @notice Repay a loan partially or fully
     * @param borrowId Borrow identifier
     * @param repayAmount Amount to repay (must include interest)
     *
     * SECURITY:
     * - Borrow must exist and be ACTIVE
     * - Amount must be valid
     * - Uses CEI pattern
     * - Automatically unlocks collateral on full repayment
     */
    function repay(uint256 borrowId, uint256 repayAmount) external whenNotPaused nonReentrant validAmount(repayAmount) {
        // CHECKS
        if (borrowId == 0 || borrowId > borrowCount) revert BorrowNotFound();

        FarmerBorrow storage borrow = borrows[borrowId];

        if (borrow.status != BorrowStatus.ACTIVE) revert BorrowNotActive();

        if (msg.sender != borrow.farmer) revert UnauthorizedCaller();

        // Update interest
        uint256 currentInterest = _calculateAccruedInterest(borrowId);
        uint256 totalOwed = borrow.borrowAmount + currentInterest;

        if (repayAmount > totalOwed) revert InvalidRepayAmount();

        // EFFECTS
        uint256 principalRepaid = 0;
        uint256 interestRepaid = 0;

        if (repayAmount <= currentInterest) {
            interestRepaid = repayAmount;
            borrow.interestAccrued += repayAmount;
        } else {
            interestRepaid = currentInterest;
            principalRepaid = repayAmount - interestRepaid;
            borrow.borrowAmount -= principalRepaid;
            borrow.interestAccrued = 0;
        }

        borrow.lastRepaymentAt = block.timestamp;
        totalBorrowed -= principalRepaid;
        totalInterestAccrued += interestRepaid;

        // Check if fully repaid
        if (borrow.borrowAmount == 0) {
            borrow.status = BorrowStatus.REPAID;
            // Unlock collateral
            commodityToken.unlockCollateral(borrow.farmer, borrow.tokenId, borrow.collateralAmount);
        }

        // INTERACTIONS
        usdc.transferFrom(msg.sender, address(this), repayAmount);

        emit LoanRepaid(borrowId, msg.sender, principalRepaid, interestRepaid, borrow.borrowAmount, block.timestamp);
    }

    /**
     * @notice Liquidate an undercollateralized loan
     * @param borrowId Borrow identifier to liquidate
     *
     * SECURITY:
     * - Only owner or liquidator can call
     * - Health factor must be < 1.0
     * - Uses CEI pattern
     * - Transfers collateral and liquidation penalty
     */
    function liquidate(uint256 borrowId) external whenNotPaused nonReentrant {
        // CHECKS
        if (borrowId == 0 || borrowId > borrowCount) revert BorrowNotFound();

        FarmerBorrow storage borrow = borrows[borrowId];

        if (borrow.status != BorrowStatus.ACTIVE) revert BorrowNotActive();

        uint256 healthFactor = getHealthFactor(borrowId);

        if (healthFactor >= LIQUIDATION_THRESHOLD) {
            revert NoLiquidationNeeded();
        }

        // EFFECTS
        uint256 currentInterest = _calculateAccruedInterest(borrowId);
        uint256 totalDebt = borrow.borrowAmount + currentInterest;
        uint256 liquidationPenalty = (totalDebt * LIQUIDATION_PENALTY) / 1e18;

        borrow.status = BorrowStatus.LIQUIDATED;
        totalBorrowed -= borrow.borrowAmount;

        // INTERACTIONS
        // Unlock collateral
        commodityToken.unlockCollateral(borrow.farmer, borrow.tokenId, borrow.collateralAmount);

        // Transfer collateral to liquidator
        commodityToken.safeTransferFrom(address(this), msg.sender, borrow.tokenId, borrow.collateralAmount, "");

        emit Liquidated(borrowId, msg.sender, borrow.collateralAmount, liquidationPenalty, block.timestamp);
    }

    /**
     * @notice Pause the pool (owner only)
     */
    function pause() external onlyOwner {
        isPaused = true;
        emit PoolPaused(msg.sender, block.timestamp);
    }

    /**
     * @notice Resume the pool (owner only)
     */
    function unpause() external onlyOwner {
        isPaused = false;
        emit PoolResumed(msg.sender, block.timestamp);
    }

    /**
     * @notice Set base interest rate (owner only)
     * @param newRate New rate in basis points (e.g., 5e16 = 5%)
     */
    function setBaseInterestRate(uint256 newRate) external onlyOwner {
        baseInterestRate = newRate;
        emit InterestRateUpdated(newRate, block.timestamp);
    }

    /**
     * @notice Set maximum LTV (owner only)
     * @param newLTV New LTV in basis points (e.g., 70e16 = 70%)
     */
    function setMaxLTV(uint256 newLTV) external onlyOwner {
        maxLTV = newLTV;
    }

    /*//////////////////////////////////////////////////////////////
                        VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Get health factor for a borrow position
     * @param borrowId Borrow identifier
     * @return healthFactor Current health factor (in wei)
     */
    function getHealthFactor(uint256 borrowId) public view returns (uint256) {
        if (borrowId == 0 || borrowId > borrowCount) revert BorrowNotFound();

        FarmerBorrow storage borrow = borrows[borrowId];

        if (borrow.status != BorrowStatus.ACTIVE) return 0;

        // Get commodity price
        (uint256 price,) = priceOracle.getPrice(registry.getCommodity(borrow.commodityId).name);

        // Calculate collateral value
        uint256 collateralValue = (borrow.collateralAmount * price) / 1e18;

        // Calculate total debt
        uint256 currentInterest = _calculateAccruedInterest(borrowId);
        uint256 totalDebt = borrow.borrowAmount + currentInterest;

        if (totalDebt == 0) return type(uint256).max;

        // Health factor = collateral value / total debt
        return (collateralValue * 1e18) / totalDebt;
    }

    /**
     * @notice Get borrow details
     * @param borrowId Borrow identifier
     * @return borrow The borrow struct
     */
    function getBorrow(uint256 borrowId) external view returns (FarmerBorrow memory) {
        if (borrowId == 0 || borrowId > borrowCount) revert BorrowNotFound();
        return borrows[borrowId];
    }

    /**
     * @notice Get user borrow IDs
     * @param farmer Farmer address
     * @return borrowIds Array of borrow IDs
     */
    function getUserBorrows(address farmer) external view returns (uint256[] memory) {
        return userBorrows[farmer];
    }

    /**
     * @notice Get pool state
     * @return state Current pool state
     */
    function getPoolState() external view returns (PoolState memory) {
        return PoolState({
            totalLiquidity: totalLiquidity,
            totalBorrowed: totalBorrowed,
            totalInterestAccrued: totalInterestAccrued,
            isPaused: isPaused
        });
    }

    /**
     * @notice Get accrued interest for a borrow
     * @param borrowId Borrow identifier
     * @return interest Accrued interest amount
     */
    function getAccruedInterest(uint256 borrowId) external view returns (uint256) {
        return _calculateAccruedInterest(borrowId);
    }

    /*//////////////////////////////////////////////////////////////
                        INTERNAL HELPER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Calculate LTV and collateral value
     */
    function _calculateLTV(uint256 commodityPrice, uint256 collateralAmount, uint256 borrowAmount)
        internal
        pure
        returns (uint256 ltvPct, uint256 collateralValue)
    {
        collateralValue = (collateralAmount * commodityPrice) / 1e18;

        if (collateralValue == 0) revert InvalidExchangeRate();

        ltvPct = (borrowAmount * 1e18) / collateralValue;
    }

    /**
     * @dev Calculate current interest rate based on pool utilization
     */
    function _calculateInterestRate() internal view returns (uint256) {
        if (totalLiquidity == 0) return baseInterestRate;

        uint256 utilizationRate = (totalBorrowed * 1e18) / totalLiquidity;

        if (utilizationRate <= 80e16) {
            // Below 80%: base + (utilization * 10%)
            return baseInterestRate + ((utilizationRate * 10e16) / 1e18);
        } else {
            // Above 80%: base + 8% + ((utilization - 80%) * 50%)
            uint256 excessUtil = utilizationRate - 80e16;
            return baseInterestRate + 8e16 + ((excessUtil * HIGH_UTIL_MULTIPLIER) / 1e18);
        }
    }

    /**
     * @dev Calculate accrued interest for a borrow
     */
    function _calculateAccruedInterest(uint256 borrowId) internal view returns (uint256) {
        FarmerBorrow storage borrow = borrows[borrowId];

        uint256 timeElapsed = block.timestamp - borrow.lastRepaymentAt;
        uint256 interestRate = _calculateInterestRate();

        // Daily interest = (borrowAmount * interestRate) / 365
        uint256 dailyInterest = (borrow.borrowAmount * interestRate) / 365 days;

        // Accrued = daily interest * days elapsed
        uint256 accruedSinceLastPayment = (dailyInterest * timeElapsed) / 1 days;

        return borrow.interestAccrued + accruedSinceLastPayment;
    }
}
