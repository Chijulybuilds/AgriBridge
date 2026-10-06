// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    AutomationCompatibleInterface
} from "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";

/// @notice The pool surface the keeper uses; it needs KEEPER_ROLE on the pool.
interface ILiquidatablePool {
    function activeLoanIds() external view returns (uint256[] memory);
    function isLiquidatable(uint256 _loanId) external view returns (bool);
    function liquidateWithReserves(uint256 _loanId) external;
}

/**
 * @title LiquidationKeeper
 * @author ChijulyBuilds (AgriBridge Protocol Team)
 * @notice Chainlink Automation upkeep that liquidates loans past their liquidation point, or overdue,
 *         with protocol reserves. It is the backstop: anyone can liquidate for the bonus, and the
 *         keeper makes sure it happens even when nobody does.
 * @dev `checkUpkeep` runs off-chain and scans every open loan; `performUpkeep` liquidates up to
 *      MAX_BATCH of them. Anyone may call `performUpkeep`: each loan is checked again on-chain, and a
 *      loan that is no longer liquidatable (or that reserves cannot cover) is skipped, not reverted.
 */
contract LiquidationKeeper is AutomationCompatibleInterface {
    uint256 public constant MAX_BATCH = 5;

    ILiquidatablePool public immutable i_pool;

    event LoanLiquidatedByKeeper(uint256 indexed loanId);
    event LiquidationSkipped(uint256 indexed loanId, bytes reason);

    error LiquidationKeeper__InvalidAddress();

    constructor(address _pool) {
        if (_pool == address(0)) revert LiquidationKeeper__InvalidAddress();
        i_pool = ILiquidatablePool(_pool);
    }

    /// @inheritdoc AutomationCompatibleInterface
    function checkUpkeep(bytes calldata) external view override returns (bool upkeepNeeded, bytes memory performData) {
        uint256[] memory open = i_pool.activeLoanIds();
        uint256[] memory due = new uint256[](MAX_BATCH);
        uint256 count;

        for (uint256 i = 0; i < open.length && count < MAX_BATCH; i++) {
            // A stale price makes the check revert; such a loan simply waits for a fresh price.
            try i_pool.isLiquidatable(open[i]) returns (bool liquidatable) {
                if (liquidatable) due[count++] = open[i];
            } catch {}
        }
        if (count == 0) return (false, "");

        assembly {
            mstore(due, count)
        }
        return (true, abi.encode(due));
    }

    /// @inheritdoc AutomationCompatibleInterface
    function performUpkeep(bytes calldata _performData) external override {
        uint256[] memory loanIds = abi.decode(_performData, (uint256[]));
        for (uint256 i = 0; i < loanIds.length && i < MAX_BATCH; i++) {
            try i_pool.liquidateWithReserves(loanIds[i]) {
                emit LoanLiquidatedByKeeper(loanIds[i]);
            } catch (bytes memory reason) {
                emit LiquidationSkipped(loanIds[i], reason);
            }
        }
    }
}
