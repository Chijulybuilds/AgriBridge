// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {CommodityRegistry} from "src/CommodityRegistry.sol";
/**
 * @title DeployCommodityRegistry
 * @dev Script to deploy the CommodityRegistry contract exclusively on Sepolia Testnet!!
 */

contract DeployCommodityRegistry is Script {
    function run() external returns (CommodityRegistry) {
        address admin = vm.envAddress("ADMIN_ADDRESS");
        vm.startBroadcast();
        CommodityRegistry commodityRegistry = new CommodityRegistry(admin);
        vm.stopBroadcast();

        return commodityRegistry;
    }
}
