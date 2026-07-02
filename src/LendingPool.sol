// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AgriShareToken} from "src/AgriShareToken.sol";


/*//////////////////////////////////////////////////////////////
                          INTERFACES
////////////////////////////////////////////////////////////*/

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
        uint256 quantity;
        uint256 storageEndDate;
        CommodityStatus status;
        uint256 tokenId;
    }

    function getCommodity(uint256 commodityId) external view returns (Commodity memory);
    function isCommodityValid(uint256 commodityId) external view returns (bool);
    function isCommodityExpired(uint256 commodityId) external view returns (bool);
}

interface ICommodityToken {
    function getAvailableBalance(address account, uint256 tokenId) external view returns (uint256);
    function lockCollateral(address account, uint256 tokenId, uint256 amount) external;
    function unlockCollateral(address account, uint256 tokenId, uint256 amount) external;
    function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes calldata data) external;
}


interface ICommodityPriceOracle {
    function getCollateralValue(uint256 commodityId, uint256 quantity) external view returns (uint256 usdValue);
}

/*//////////////////////////////////////////////////////////////
                         MAIN CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title LendingPool
 * @author AgriDeFi Protocol Team / Senior Engineering Refactor
 * @notice Core yield-vault and loan facility optimized with dynamic index math scaling.
 */
contract LendingPool is Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                            CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint256 private constant INDEX_PRECISION = 1e18;
    uint256 private constant INTEREST_RATE_PRECISION = 1e18;

    uint256 private constant BASE_INTEREST_RATE = 5e16; // 5% base rate
    uint256 private constant HIGH_UTIL_MULTIPLIER = 50e16;
    uint256 private constant UTILIZATION_KINK = 80e16; // 80% Kink boundary

    uint256 private constant LIQUIDATION_THRESHOLD = 1e18; // 1.0 Health factor scale
    uint256 private constant LIQUIDATION_PENALTY = 10e16; // 10% penalty
    uint256 private constant MAX_LTV = 70e16; // 70% Max Loan-To-Value

    uint256 private constant MIN_BORROW_AMOUNT = 100e6; // $100 Floor bound (Assuming 6 decimal USDC)
    uint256 private constant MAX_BORROW_AMOUNT = 10_000_000e6; // $10M Ceiling bound

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

    struct Loan {
        uint256 principal;
        uint256 interestIndex;
        uint256 commodityId;
        uint256 collateralTokenId;
        uint256 collateralAmount;
        uint64 openedAt;
        uint64 lastAccruedAt;
        LoanStatus status;
        address farmer;
    }

    /*//////////////////////////////////////////////////////////////
                            IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    IERC20 public immutable i_usdc;
    ICommodityRegistry public immutable i_registry;
    ICommodityToken public immutable i_commodityToken;
    AgriShareToken public immutable i_shareToken;
    ICommodityPriceOracle public immutable i_priceOracle;

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    uint256 public totalBorrowed;
    uint256 public totalAccumulatedReserves;
    uint256 public reserveFactor = 20e16; // 20% to protocol reserves, 80% to LPs

    uint256 public globalBorrowIndex;
    uint256 public lastGlobalAccrualTimestamp;

    uint256 public loanCount;
    mapping(uint256 => Loan) public loans;
    mapping(address => uint256[]) private s_userLoans;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event LiquidityDeposited(address indexed investor, uint256 assets, uint256 sharesMinted);
    event LiquidityWithdrawn(address indexed investor, uint256 assetsReturned, uint256 sharesBurned);
    event LoanOpened(uint256 indexed loanId, address indexed farmer, uint256 principal, uint256 collateralAmount);
    event LoanRepaid(uint256 indexed loanId, address indexed farmer, uint256 principalPaid, uint256 interestPaid);
    event LoanLiquidated(
        uint256 indexed loanId, address indexed liquidator, uint256 debtCovered, uint256 collateralSeized
    );
    event GlobalIndexUpdated(uint256 newIndex, uint256 totalReserves);

    /*//////////////////////////////////////////////////////////////
                             CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    error LendingPool__NotGovernance();
    error LendingPool__ZeroAddress();
    error LendingPool__ZeroAmount();
    error LendingPool__InvalidLoanBounds();
    error LendingPool__InsufficientPoolCash();
    error LendingPool__CommodityInvalid();
    error LendingPool__CommodityExpired();
    error LendingPool__Unauthorized();
    error LendingPool__InsufficientCollateralBalance();
    error LendingPool__ExceedsMaxLTV();
    error LendingPool__LoanNotActive();
    error LendingPool__RepaymentOverflow();
    error LendingPool__PositionSafe();
    error LendingPool__NativeTokenNotSupported();
    error LendingPool__InvalidCall();

    /*//////////////////////////////////////////////////////////////
                             MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier checkZeroAmount(uint256 _amount) {
        if (_amount == 0) revert LendingPool__ZeroAmount();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address _usdc, address _registry, address _commodityToken, address _shareToken, address _priceOracle) {
        if (
            _usdc == address(0) || _registry == address(0) || _commodityToken == address(0) || _shareToken == address(0)
                || _priceOracle == address(0)
        ) {
            revert LendingPool__ZeroAddress();
        }

        i_usdc = IERC20(_usdc);
        i_registry = ICommodityRegistry(_registry);
        i_commodityToken = ICommodityToken(_commodityToken);
        i_shareToken = AgriShareToken(_shareToken);
        i_priceOracle = ICommodityPriceOracle(_priceOracle);

        globalBorrowIndex = INDEX_PRECISION; // Initialized to 1.0 (scaled)
        lastGlobalAccrualTimestamp = block.timestamp;
    }

    /*//////////////////////////////////////////////////////////////
                        EXTERNAL MUTATIVE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Deposit underlying asset liquidity into the vault pool to mint interest-bearing shares by Investors.
     */
    function deposit(uint256 _assets) external whenNotPaused nonReentrant checkZeroAmount(_assets) {
        _accrueGlobalInterest();

        uint256 sharesToMint = _convertToShares(_assets);

        i_shareToken.mintShares(msg.sender, sharesToMint);
        i_usdc.safeTransferFrom(msg.sender, address(this), _assets);

        emit LiquidityDeposited(msg.sender, _assets, sharesToMint);
    }

    /**
     * @notice Redeem vault tracking shares to reclaim accumulated underlying assets plus accrued yield.
     */
    function withdraw(uint256 _shares) external whenNotPaused nonReentrant checkZeroAmount(_shares) {
        _accrueGlobalInterest();

        uint256 assetsToReturn = _convertToAssets(_shares);
        if (assetsToReturn > i_usdc.balanceOf(address(this))) revert LendingPool__InsufficientPoolCash();

        i_shareToken.burnShares(msg.sender, _shares);
        i_usdc.safeTransfer(msg.sender, assetsToReturn);

        emit LiquidityWithdrawn(msg.sender, assetsToReturn, _shares);
    }

    /**
     * @notice Borrow underlying assets against highly scoped, non-transferable tokenized warehouse receipts.
     */
    function borrow(uint256 _commodityId, uint256 _collateralAmount, uint256 _borrowAmount)
        external
        whenNotPaused
        nonReentrant
        checkZeroAmount(_borrowAmount)
        returns (uint256)
    {
        if (_borrowAmount < MIN_BORROW_AMOUNT || _borrowAmount > MAX_BORROW_AMOUNT) {
            revert LendingPool__InvalidLoanBounds();
        }
        if (_borrowAmount > i_usdc.balanceOf(address(this))) revert LendingPool__InsufficientPoolCash();

        _accrueGlobalInterest();

        if (!i_registry.isCommodityValid(_commodityId)) revert LendingPool__CommodityInvalid();
        if (i_registry.isCommodityExpired(_commodityId)) revert LendingPool__CommodityExpired();

        ICommodityRegistry.Commodity memory commodity = i_registry.getCommodity(_commodityId);
        if (commodity.farmer != msg.sender) revert LendingPool__Unauthorized();

        if (i_commodityToken.getAvailableBalance(msg.sender, commodity.tokenId) < _collateralAmount) {
            revert LendingPool__InsufficientCollateralBalance();
        }

        uint256 collateralUSDValue = i_priceOracle.getCollateralValue(_commodityId, _collateralAmount);
        uint256 calculatedLTV = (_borrowAmount * INDEX_PRECISION) / collateralUSDValue;
        if (calculatedLTV > MAX_LTV) revert LendingPool__ExceedsMaxLTV();

        uint256 loanId = ++loanCount;
        loans[loanId] = Loan({
            principal: _borrowAmount,
            interestIndex: globalBorrowIndex,
            commodityId: _commodityId,
            collateralTokenId: commodity.tokenId,
            collateralAmount: _collateralAmount,
            openedAt: uint64(block.timestamp),
            lastAccruedAt: uint64(block.timestamp),
            status: LoanStatus.ACTIVE,
            farmer: msg.sender
        });

        s_userLoans[msg.sender].push(loanId);
        totalBorrowed += _borrowAmount;

        i_commodityToken.lockCollateral(msg.sender, commodity.tokenId, _collateralAmount);
        i_usdc.safeTransfer(msg.sender, _borrowAmount);

        emit LoanOpened(loanId, msg.sender, _borrowAmount, _collateralAmount);
        return loanId;
    }

    /**
     * @notice Repays active debt principal plus interest based on dynamic $O(1)$ scalar calculation matrix.
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

        uint256 totalCurrentOwed = _calculateCurrentDebt(loan);
        if (_repayAmount > totalCurrentOwed) revert LendingPool__RepaymentOverflow();

        uint256 interestPortion = totalCurrentOwed - loan.principal;
        uint256 interestPaid;
        uint256 principalPaid;

        if (_repayAmount <= interestPortion) {
            interestPaid = _repayAmount;
        } else {
            interestPaid = interestPortion;
            principalPaid = _repayAmount - interestPortion;
        }

        loan.principal = totalCurrentOwed - _repayAmount;
        loan.interestIndex = globalBorrowIndex;
        loan.lastAccruedAt = uint64(block.timestamp);

        totalBorrowed -= principalPaid;

        if (loan.principal == 0) {
            loan.status = LoanStatus.REPAID;
            i_commodityToken.unlockCollateral(loan.farmer, loan.collateralTokenId, loan.collateralAmount);
        }

        i_usdc.safeTransferFrom(msg.sender, address(this), _repayAmount);
        emit LoanRepaid(_loanId, loan.farmer, principalPaid, interestPaid);
    }

    /**
     * @notice Seizes undercollateralized positions when position drops below Liquidation Threshold boundaries.
     */
    function liquidate(uint256 _loanId) external whenNotPaused nonReentrant {
        _accrueGlobalInterest();

        Loan storage loan = loans[_loanId];
        if (loan.status != LoanStatus.ACTIVE) revert LendingPool__LoanNotActive();

        uint256 currentHealthFactor = getHealthFactor(_loanId);
        if (currentHealthFactor >= LIQUIDATION_THRESHOLD) revert LendingPool__PositionSafe();

        uint256 totalDebtToCover = _calculateCurrentDebt(loan);

        loan.status = LoanStatus.LIQUIDATED;
        totalBorrowed -= loan.principal;

        i_commodityToken.unlockCollateral(loan.farmer, loan.collateralTokenId, loan.collateralAmount);
        i_usdc.safeTransferFrom(msg.sender, address(this), totalDebtToCover);
        i_commodityToken.safeTransferFrom(address(this), msg.sender, loan.collateralTokenId, loan.collateralAmount, "");

        emit LoanLiquidated(_loanId, msg.sender, totalDebtToCover, loan.collateralAmount);
    }

    /*//////////////////////////////////////////////////////////////
                            INTERNAL ENGINE
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Linear dynamic interest compilation engine updating the global borrow index state.
     */
    function _accrueGlobalInterest() internal {
        uint256 timeElapsed = block.timestamp - lastGlobalAccrualTimestamp;
        if (timeElapsed == 0) return;

        uint256 rate = getBorrowRate();
        uint256 interestFactor = (rate * timeElapsed) / 365 days;

        uint256 totalInterestAccrued = (totalBorrowed * interestFactor) / INTEREST_RATE_PRECISION;

        if (totalInterestAccrued > 0) {
            uint256 protocolReservePortion = (totalInterestAccrued * reserveFactor) / INDEX_PRECISION;
            totalAccumulatedReserves += protocolReservePortion;

            globalBorrowIndex += (globalBorrowIndex * interestFactor) / INTEREST_RATE_PRECISION;
        }

        lastGlobalAccrualTimestamp = block.timestamp;
        emit GlobalIndexUpdated(globalBorrowIndex, totalAccumulatedReserves);
    }

    function _calculateCurrentDebt(Loan memory _loan) internal view returns (uint256) {
        return (_loan.principal * globalBorrowIndex) / _loan.interestIndex;
    }

    function _convertToShares(uint256 _assets) internal view returns (uint256) {
        uint256 supply = i_shareToken.totalSupply();
        return (supply == 0) ? _assets : (_assets * supply) / totalAssets();
    }

    function _convertToAssets(uint256 _shares) internal view returns (uint256) {
        uint256 supply = i_shareToken.totalSupply();
        return (supply == 0) ? _shares : (_shares * totalAssets()) / supply;
    }

    /*//////////////////////////////////////////////////////////////
                            EXTERNAL VIEWS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Dynamically evaluates total underlying assets under custody minus current locked internal protocol reserves.
     */
    function totalAssets() public view returns (uint256) {
        return (i_usdc.balanceOf(address(this)) + totalBorrowed) - totalAccumulatedReserves;
    }

    /**
     * @notice Implements standard Kink Utilization rate modeling equations.
     */
    function getBorrowRate() public view returns (uint256) {
        uint256 poolCash = i_usdc.balanceOf(address(this));
        if (poolCash + totalBorrowed == 0) return BASE_INTEREST_RATE;

        uint256 utilization = (totalBorrowed * INTEREST_RATE_PRECISION) / (poolCash + totalBorrowed);

        if (utilization <= UTILIZATION_KINK) {
            return BASE_INTEREST_RATE + ((utilization * 10e16) / INTEREST_RATE_PRECISION);
        } else {
            uint256 excessUtil = utilization - UTILIZATION_KINK;
            return BASE_INTEREST_RATE + 8e16 + ((excessUtil * HIGH_UTIL_MULTIPLIER) / INTEREST_RATE_PRECISION);
        }
    }

    /**
     * @notice Evaluates health configurations ($USD collateral weight divided by total active liabilities).
     */
    function getHealthFactor(uint256 _loanId) public view returns (uint256) {
        Loan memory loan = loans[_loanId];
        if (loan.status != LoanStatus.ACTIVE) return 0;

        uint256 collateralUSDValue = i_priceOracle.getCollateralValue(loan.commodityId, loan.collateralAmount);
        uint256 currentDebtValue = _calculateCurrentDebt(loan);

        if (currentDebtValue == 0) return type(uint256).max;
        return (collateralUSDValue * INDEX_PRECISION) / currentDebtValue;
    }

    function getUserLoans(address _user) external view returns (uint256[] memory) {
        return s_userLoans[_user];
    }

    /*//////////////////////////////////////////////////////////////
                        ADMIN / CIRCUIT BREAKER
    //////////////////////////////////////////////////////////////*/

    function pause() external {
        _pause();
    }

    function unpause() external {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
                        DEFENSIVE FALLBACK REJECTIONS
    //////////////////////////////////////////////////////////////*/

    receive() external payable {
        revert LendingPool__NativeTokenNotSupported();
    }

    fallback() external payable {
        revert LendingPool__InvalidCall();
    }
}
