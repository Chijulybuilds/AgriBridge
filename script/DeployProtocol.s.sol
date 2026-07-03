// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {LendingPool} from "src/LendingPool.sol";
import {AgriShareToken} from "src/AgriShareToken.sol";

contract DeployProtocol is Script {
    function run() external {
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address usdc = vm.envAddress("USDC_CONTRACT_ADDRESS");
        address registry = vm.envAddress("REGISTRY_ADDRESS");
        address commodityToken = vm.envAddress("TOKEN_ADDRESS");
        address priceOracle = vm.envAddress("PRICE_ORACLE_ADDRESS");

        vm.startBroadcast();

        // 1. Deploy Share Token first (No lending pool address passed yet)
        AgriShareToken shareToken = new AgriShareToken(usdc, "agUSDC", "aU");

        // 2. Deploy Lending Pool with the newly created shareToken address
        LendingPool lendingPool =
            new LendingPool(admin, usdc, registry, commodityToken, address(shareToken), priceOracle);

        // 3. Complete the link by setting the pool back on the Share Token
        shareToken.setLendingPool(address(lendingPool));

        vm.stopBroadcast();
    }
}
