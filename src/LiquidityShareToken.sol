// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LiquidityShareToken
 * @author AgriDeFi Protocol Team
 * @notice ERC20 token representing investor shares in the lending pool
 * @dev Phase 2 Step 5: Receipt tokens (agUSDC)
 *
 * SECURITY FEATURES:
 * - ERC20: Standard token interface
 * - Ownable: Owner controls minting/burning
 * - ReentrancyGuard: Protects transfers
 * - Only lending pool can mint/burn
 */
contract LiquidityShareToken is ERC20, Ownable, ReentrancyGuard {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @dev Authorized lending pool that can mint/burn
    address public lendingPool;

    /// @dev Decimals precision (same as USDC: 6)
    uint8 public constant DECIMALS = 6;

    /*//////////////////////////////////////////////////////////////
                            EVENTS
    //////////////////////////////////////////////////////////////*/

    event MintedByPool(address indexed investor, uint256 amount, uint256 timestamp);

    event BurnedByPool(address indexed investor, uint256 amount, uint256 timestamp);

    event LendingPoolUpdated(address indexed newPool, uint256 timestamp);

    /*//////////////////////////////////////////////////////////////
                            ERRORS
    //////////////////////////////////////////////////////////////*/

    error OnlyLendingPoolCanMint();
    error OnlyLendingPoolCanBurn();
    error InvalidAmount();
    error InsufficientBalance();
    error InvalidAddress();

    /*//////////////////////////////////////////////////////////////
                            MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier onlyLendingPool() {
        if (msg.sender != lendingPool) revert OnlyLendingPoolCanMint();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address initialLendingPool) ERC20("AgriDeFi USDC Share Token", "agUSDC") Ownable(msg.sender) {
        if (initialLendingPool == address(0)) revert InvalidAddress();
        lendingPool = initialLendingPool;
    }

    /*//////////////////////////////////////////////////////////////
                        EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Mint shares for an investor (only lending pool)
     * @param to Recipient address (investor)
     * @param amount Amount to mint
     *
     * SECURITY:
     * - Only lending pool can call
     * - Amount must be > 0
     * - Uses CEI pattern
     */
    function mint(address to, uint256 amount) external onlyLendingPool nonReentrant {
        // CHECKS
        if (amount == 0) revert InvalidAmount();
        if (to == address(0)) revert InvalidAddress();

        // EFFECTS
        _mint(to, amount);

        // INTERACTIONS
        emit MintedByPool(to, amount, block.timestamp);
    }

    /**
     * @notice Burn shares from an investor (only lending pool)
     * @param account Account to burn from
     * @param amount Amount to burn
     *
     * SECURITY:
     * - Only lending pool can call
     * - Account must have sufficient balance
     * - Uses CEI pattern
     */
    function burn(address account, uint256 amount) external onlyLendingPool nonReentrant {
        // CHECKS
        if (amount == 0) revert InvalidAmount();

        if (balanceOf(account) < amount) revert InsufficientBalance();

        // EFFECTS
        _burn(account, amount);

        // INTERACTIONS
        emit BurnedByPool(account, amount, block.timestamp);
    }

    /**
     * @notice Set lending pool address (owner only)
     * @param newPool New lending pool address
     */
    function setLendingPool(address newPool) external onlyOwner {
        if (newPool == address(0)) revert InvalidAddress();

        lendingPool = newPool;
        emit LendingPoolUpdated(newPool, block.timestamp);
    }

    /*//////////////////////////////////////////////////////////////
                        OVERRIDE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Return decimals (6, same as USDC)
     */
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /**
     * @notice Get lending pool address
     * @return poolAddress Address of authorized lending pool
     */
    function getLendingPool() external view returns (address) {
        return lendingPool;
    }
}
