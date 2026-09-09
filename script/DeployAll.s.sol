// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {CommodityToken} from "src/CommodityToken.sol";
import {CommodityPriceOracle} from "src/CommodityPriceOracle.sol";
import {AgriShareToken} from "src/AgriShareToken.sol";
import {LendingPool} from "src/LendingPool.sol";
import {ICommodityPriceOracle} from "src/interfaces/ICommodityPriceOracle.sol";

/**
 * @title DeployAll
 * @notice Deploys the full protocol and performs every cross-contract wiring step.
 * @dev The previous scripts deployed contracts individually and never wired them: nothing called
 *      setCommodityTokenAddress, setLendingPoolAddress, or granted POOL_ROLE and VERIFIER_ROLE, so
 *      a fresh deployment could not approve a commodity or open a loan. This script is the single
 *      supported path and leaves the protocol immediately usable.
 *
 *      Required environment: USDC_CONTRACT_ADDRESS, VERIFIER_ADDRESS, TOKEN_METADATA_BASE_URI.
 *      Optional: ADMIN_ADDRESS, which receives admin rights at the end if it differs from the
 *      broadcasting deployer.
 *
 *      Run with: make deploy-all
 */
contract DeployAll is Script {
    /// @dev Initial prices, 8 decimals, in USD per kilogram.
    uint128 internal constant COCOA_PRICE = 650 * 10 ** 6; // $6.50
    uint128 internal constant RICE_PRICE = 120 * 10 ** 6; // $1.20
    uint128 internal constant MAIZE_PRICE = 45 * 10 ** 6; // $0.45
    uint128 internal constant CASHEW_PRICE = 320 * 10 ** 6; // $3.20
    uint128 internal constant YAM_PRICE = 85 * 10 ** 6; // $0.85

    uint256 internal constant HEARTBEAT = 1 days;

    function run()
        external
        returns (
            CommodityRegistry registry,
            CommodityToken commodityToken,
            CommodityPriceOracle oracle,
            AgriShareToken shareToken,
            LendingPool pool
        )
    {
        address usdc = vm.envAddress("USDC_CONTRACT_ADDRESS");
        address verifier = vm.envAddress("VERIFIER_ADDRESS");
        string memory baseUri = vm.envString("TOKEN_METADATA_BASE_URI");
        address finalAdmin = vm.envOr("ADMIN_ADDRESS", address(0));

        vm.startBroadcast();

        address deployer = msg.sender;

        // 1. Registry first: the token and oracle both reference it.
        registry = new CommodityRegistry(deployer);

        // 2. Token grants MINTER_ROLE to the registry in its constructor.
        commodityToken = new CommodityToken(deployer, address(registry), baseUri);

        // 3. Oracle, which resolves commodity ids through the registry.
        oracle = new CommodityPriceOracle(deployer, HEARTBEAT);

        // 4. Share token, then the pool that is allowed to mint and burn its shares.
        shareToken = new AgriShareToken(usdc, "agUSDC", "aU");
        pool = new LendingPool(
            deployer, usdc, address(registry), address(commodityToken), address(shareToken), address(oracle)
        );

        // 5. Wiring. Without these the protocol deploys but cannot function.
        shareToken.setLendingPool(address(pool));
        registry.setCommodityTokenAddress(address(commodityToken));
        registry.setLendingPoolAddress(address(pool));
        registry.grantRole(registry.VERIFIER_ROLE(), verifier);
        registry.grantRole(registry.POOL_ROLE(), address(pool));
        oracle.setCommodityRegistry(address(registry));

        // 6. Seed prices so collateral can be valued straight away.
        oracle.setPrice(ICommodityPriceOracle.CommodityType.Cocoa, COCOA_PRICE);
        oracle.setPrice(ICommodityPriceOracle.CommodityType.Rice, RICE_PRICE);
        oracle.setPrice(ICommodityPriceOracle.CommodityType.Maize, MAIZE_PRICE);
        oracle.setPrice(ICommodityPriceOracle.CommodityType.Cashew, CASHEW_PRICE);
        oracle.setPrice(ICommodityPriceOracle.CommodityType.Yam, YAM_PRICE);

        // 7. Hand admin rights to the intended admin, if it is not the deployer.
        if (finalAdmin != address(0) && finalAdmin != deployer) {
            registry.grantRole(registry.DEFAULT_ADMIN_ROLE(), finalAdmin);
            commodityToken.grantRole(commodityToken.DEFAULT_ADMIN_ROLE(), finalAdmin);
            oracle.grantRole(oracle.DEFAULT_ADMIN_ROLE(), finalAdmin);
            oracle.grantRole(oracle.PRICE_UPDATER_ROLE(), finalAdmin);
            pool.grantRole(pool.DEFAULT_ADMIN_ROLE(), finalAdmin);
            pool.grantRole(pool.ADMIN_ROLE(), finalAdmin);
        }

        vm.stopBroadcast();

        console.log("=== AgriBridge deployed ===");
        console.log("CommodityRegistry    :", address(registry));
        console.log("CommodityToken       :", address(commodityToken));
        console.log("CommodityPriceOracle :", address(oracle));
        console.log("AgriShareToken       :", address(shareToken));
        console.log("LendingPool          :", address(pool));
        console.log("");
        console.log("Copy these into .env and .env.local as NEXT_PUBLIC_* addresses.");
    }
}
