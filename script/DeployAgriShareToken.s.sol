// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {AgriShareToken} from "src/AgriShareToken.sol";
/**
 * @title DeployAgriShareToken
 * @dev Script to deploy the AgriShare contract exclusively on Sepolia Testnet!!
 */

contract DeployAgriShareToken is Script {
    function run() external returns (AgriShareToken) {
        address lendingPool = vm.envAddress("LENDING_POOL_ADDRESS");
        address usdc = vm.envAddress("USDC_CONTRACT_ADDRESS");
        string memory name = "agUSDC";
        string memory symbol = "aU";

        vm.startBroadcast();
        AgriShareToken agriShareToken = new AgriShareToken(
            lendingPool,
            usdc,
            name,
            symbol
        );
        vm.stopBroadcast();

        return agriShareToken;
    }
}
