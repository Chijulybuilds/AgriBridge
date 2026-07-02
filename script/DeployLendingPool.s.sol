// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {LendingPool} from "src/LendingPool.sol";
/**
 * @title DeployLendingPool
 * @dev Script to deploy the LendingPool contract exclusively on Sepolia Testnet!!
 */

contract DeployLendingPool is Script {
    function run() external returns (LendingPool) {
        address usdc = vm.envAddress("USDC_CONTRACT_ADDRESS");
        address registry = vm.envAddress("REGISTRY_ADDRESS");
        address commodityToken = vm.envAddress("TOKEN_ADDRESS");
        address shareToken = vm.envAddress("SHARE_TOKEN_ADDRESS");
        address priceOracle = vm.envAddress("PRICE_ORACLE_ADDRESS");

        vm.startBroadcast();
        LendingPool lendingPool = new LendingPool(usdc, registry, commodityToken, shareToken, priceOracle);
        vm.stopBroadcast();

        return lendingPool;
    }
}
