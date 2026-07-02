// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {CommodityToken} from "src/CommodityToken.sol";

/**
 * @title DeployCommodityToken
 * @author ChijulyBuilds (AgriBridge Protocol Team)
 * @notice Script to deploy CommodityToken contract with proper role configuration.
 * @dev Deploys to Sepolia testnet. Requires .env variables:
 *      - ADMIN_ADDRESS: Backend engineer's wallet (gets DEFAULT_ADMIN_ROLE, BURNER_ROLE)
 *      - REGISTRY_ADDRESS: Deployed CommodityRegistry contract address
 *      - TOKEN_METADATA_BASE_URI: Base URL for token metadata (IPFS or backend API)
 *
 */
contract DeployCommodityToken is Script {
    function run() external returns (CommodityToken) {
        // Load environment variables
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address registryAddress = vm.envAddress("REGISTRY_ADDRESS");
        string memory baseURI = vm.envString("TOKEN_METADATA_BASE_URI");

        // Validate critical inputs
        require(admin != address(0), "DeployCommodityToken: ADMIN_ADDRESS not set");
        require(registryAddress != address(0), "DeployCommodityToken: REGISTRY_ADDRESS not set");
        require(bytes(baseURI).length > 0, "DeployCommodityToken: TOKEN_METADATA_BASE_URI not set");

        // Start broadcast (transaction recording)
        vm.startBroadcast();

        // Deploy CommodityToken
        // - admin receives DEFAULT_ADMIN_ROLE and BURNER_ROLE
        // - registryAddress receives MINTER_ROLE (only it can mint tokens)
        // - baseURI is set to the provided metadata endpoint
        CommodityToken commodityToken = new CommodityToken(admin, registryAddress, baseURI);

        vm.stopBroadcast();

        return commodityToken;
    }
}
