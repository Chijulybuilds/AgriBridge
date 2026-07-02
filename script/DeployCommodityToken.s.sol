// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {CommodityToken} from "src/CommodityToken.sol";
/**
 * @title DeployCommodityToken
 * @dev Script to deploy the CommodityToken contract exclusively on Sepolia Testnet!!
 */

contract DeployCommodityToken is Script {
    function run() external returns (CommodityToken) {
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address registryAddress = vm.envAddress("REGISTRY_ADDRESS");
        string memory baseURI = vm.envString("BASE_URI");
        vm.startBroadcast();
        CommodityToken commodityToken = new CommodityToken(admin, registryAddress, baseURI);
        vm.stopBroadcast();

        return commodityToken;
    }
}
