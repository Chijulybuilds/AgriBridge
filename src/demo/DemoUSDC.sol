// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title DemoUSDC
 * @notice A worthless 6-decimal stand-in for USDC, for demos and test networks only.
 * @dev Anyone can mint from the built-in faucet, so the app can offer a "Get test USDC" button
 *      without a backend or a funded treasury. Never deploy this where tokens have value.
 */
contract DemoUSDC is ERC20 {
    /// @notice Most a single faucet call can mint: 100,000 dUSDC.
    uint256 public constant FAUCET_LIMIT = 100_000e6;

    error DemoUSDC__OverFaucetLimit();

    constructor() ERC20("Demo USDC", "dUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mints test tokens to `_to`, up to FAUCET_LIMIT per call.
    function faucet(address _to, uint256 _amount) external {
        if (_amount > FAUCET_LIMIT) revert DemoUSDC__OverFaucetLimit();
        _mint(_to, _amount);
    }
}
