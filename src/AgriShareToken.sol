// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/*//////////////////////////////////////////////////////////////
                          INTERFACES
//////////////////////////////////////////////////////////////*/

interface IERC20Metadata {
    function decimals() external view returns (uint8);
}

/*//////////////////////////////////////////////////////////////
                         MAIN CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title AgriShareToken
 * @author AgriDeFi Protocol Team / Senior Engineering Refactor
 * @notice Soulbound non-transferable receipt token representing ownership shares in a LendingPool.
 * @dev 1 agLP share does NOT map 1:1 with 1 underlying asset token due to accumulated interest parameters.
 *      The LendingPool manages all dynamic exchange-rate calculations and interest-accrual variables.
 */
contract AgriShareToken is ERC20, ERC20Permit {
    /*//////////////////////////////////////////////////////////////
                            IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    address public immutable i_lendingPool;
    uint8 private immutable i_decimals;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event SharesMinted(address indexed investor, uint256 amount, uint256 timestamp);
    event SharesBurned(address indexed investor, uint256 amount, uint256 timestamp);

    /*//////////////////////////////////////////////////////////////
                             CUSTOM ERRORS
    //////////////////////////////////////////////////////////////*/

    error AgriShareToken__NotLendingPool();
    error AgriShareToken__InvalidAddress();
    error AgriShareToken__InvalidAmount();
    error AgriShareToken__TransferDisabled();

    /*//////////////////////////////////////////////////////////////
                            MODIFIER HELPERS
    //////////////////////////////////////////////////////////////*/

    modifier onlyRoleEnforced() {
        if (msg.sender != i_lendingPool) revert AgriShareToken__NotLendingPool();
        _;
    }

    modifier validationCheck(address _account, uint256 _amount) {
        if (_account == address(0)) revert AgriShareToken__InvalidAddress();
        if (_amount == 0) revert AgriShareToken__InvalidAmount();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address _lendingPool, address _usdc, string memory _name, string memory _symbol)
        ERC20(_name, _symbol)
        ERC20Permit(_name)
    {
        if (_lendingPool == address(0) || _usdc == address(0)) {
            revert AgriShareToken__InvalidAddress();
        }

        i_lendingPool = _lendingPool;

        // Dynamically matches underlying asset decimals configuration to prevent mathematical mismatch
        i_decimals = IERC20Metadata(_usdc).decimals();
    }

    /*//////////////////////////////////////////////////////////////
                        EXTERNAL MUTATIVE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Mints yield-bearing pool receipt shares for an investor deposit.
     * @param _to Recipient liquidity provider address.
     * @param _amount Number of shares to allocate.
     */
    function mintShares(address _to, uint256 _amount) external onlyRoleEnforced validationCheck(_to, _amount) {
        _mint(_to, _amount);
        emit SharesMinted(_to, _amount, block.timestamp);
    }

    /**
     * @notice Burns receipt shares from an investor balance when redeeming underlying liquidity assets.
     * @param _from Account where pool shares are removed.
     * @param _amount Quantity of vault tracking tokens to burn.
     */
    function burnShares(address _from, uint256 _amount) external onlyRoleEnforced validationCheck(_from, _amount) {
        _burn(_from, _amount);
        emit SharesBurned(_from, _amount, block.timestamp);
    }

    /*//////////////////////////////////////////////////////////////
                            EXTERNAL VIEWS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Returns dynamic decimal spacing queried from underlying asset properties during construction.
     */
    function decimals() public view override returns (uint8) {
        return i_decimals;
    }

    /*//////////////////////////////////////////////////////////////
                        INTERNAL HOOK OVERRIDES
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev Core transfer processing hook optimized for OpenZeppelin v5 architectures.
     *      Implements non-transferability constraint mechanics. Reverts user-to-user transfers.
     */
    function _update(address from, address to, uint256 value) internal override {
        // Allow mint operations (from zero address) and burn operations (to zero address) initiated by LendingPool
        if (from != address(0) && to != address(0)) {
            revert AgriShareToken__TransferDisabled();
        }
        super._update(from, to, value);
    }
}
