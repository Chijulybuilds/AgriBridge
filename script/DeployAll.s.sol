// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ProtocolDeployer} from "script/ProtocolDeployer.sol";

/**
 * @title DeployAll
 * @notice Deploys the full protocol against real USDC, seeds the six commodities and their prices,
 *         makes the Safe the only verifier, and hands it every admin role.
 * @dev Required environment: USDC_CONTRACT_ADDRESS, VERIFIER_ADDRESS (the Safe).
 *      Optional: ADMIN_ADDRESS (defaults to VERIFIER_ADDRESS); FUNCTIONS_ROUTER, the Chainlink
 *      Functions router on the target network (see Chainlink's docs), to deploy the price feeder.
 *      Warehouses are not seeded: the Safe adds the real verifier stations after deployment.
 *
 *      Run with: make deploy-all
 */
contract DeployAll is Script, ProtocolDeployer {
    uint256 internal constant HEARTBEAT = 1 days;
    string internal constant FUNCTIONS_SOURCE = "scripts/functions/commodity-prices.js";

    function run() external returns (Deployment memory d) {
        address usdc = vm.envAddress("USDC_CONTRACT_ADDRESS");
        address verifier = vm.envAddress("VERIFIER_ADDRESS");
        address finalAdmin = vm.envOr("ADMIN_ADDRESS", verifier);

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();

        d = _deployProtocol(deployer, usdc, HEARTBEAT);
        _seedCommodities(d);
        address router = vm.envOr("FUNCTIONS_ROUTER", address(0));
        if (router != address(0)) _deployFeeder(d, router, deployer, vm.readFile(FUNCTIONS_SOURCE));
        _handOver(d, deployer, verifier, finalAdmin);

        vm.stopBroadcast();
        _checkHandOver(d, deployer, verifier, finalAdmin);

        console.log("=== AgriBridge deployed ===");
        console.log("CommodityConfig      :", address(d.config));
        console.log("CommodityRegistry    :", address(d.registry));
        console.log("CommodityToken       :", address(d.commodityToken));
        console.log("CommodityPriceOracle :", address(d.oracle));
        console.log("AgriShareToken       :", address(d.shareToken));
        console.log("LendingPool          :", address(d.pool));
        console.log("LiquidationKeeper    :", address(d.keeper));
        console.log("Marketplace          :", address(d.marketplace));
        console.log("WarehouseDesk        :", address(d.desk));
        console.log("FunctionsPriceFeeder :", address(d.feeder));
        console.log("Verifier (Safe)      :", verifier);
        console.log("Admin                :", finalAdmin);
    }
}
