// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {CommodityVerifier} from "src/CommodityVerifier.sol";
/**
 * @title DeployCommodityVerifier
 * @dev Script to deploy the CommodityVerifier contract exclusively on Sepolia Testnet!!
 */

contract DeployCommodityVerifier is Script {
    function run() external returns (CommodityVerifier) {
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address registry = vm.envAddress("REGISTRY_ADDRESS");
        address token = vm.envAddress("TOKEN_ADDRESS");
        address priceOracle = vm.envAddress("PRICE_ORACLE_ADDRESS");

        vm.startBroadcast();
        CommodityVerifier commodityVerifier = new CommodityVerifier(
            admin,
            registry,
            token,
            priceOracle
        );
        vm.stopBroadcast();

        return commodityVerifier;
    }
}
