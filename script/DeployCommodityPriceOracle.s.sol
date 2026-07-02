// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {CommodityPriceOracle} from "src/CommodityPriceOracle.sol";
/**
 * @title DeployCommodityPriceOracle
 * @dev Script to deploy the CommodityPriceOracle contract exclusively on Sepolia Testnet!!
 */

contract DeployCommodityPriceOracle is Script {
    function run() external returns (CommodityPriceOracle) {
        address admin = vm.envAddress("ADMIN_ADDRESS");
        uint256 heartbeat = 86400;
        vm.startBroadcast();
        CommodityPriceOracle commodityPriceOracle = new CommodityPriceOracle(admin, heartbeat);
        vm.stopBroadcast();

        return commodityPriceOracle;
    }
}
