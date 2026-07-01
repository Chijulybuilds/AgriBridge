// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/CommodityRegistry.sol";
import "../src/CommodityPriceOracle.sol";
import "../src/CommodityToken.sol";
import "../src/LiquidityShareToken.sol";
import "../src/CommodityVerifier.sol";
import "../src/LendingPool.sol";

/**
 * @title DeployAll
 * @author AgriDeFi Protocol Team
 * @notice Deployment script for entire AgriDeFi protocol
 * @dev Phase 2 Step 7: Deploys all contracts in correct order with proper initialization
 *
 * DEPLOYMENT ORDER:
 * 1. CommodityRegistry (no dependencies)
 * 2. CommodityPriceOracle (no dependencies)
 * 3. CommodityToken (depends on Registry, Verifier address)
 * 4. LiquidityShareToken (depends on LendingPool address)
 * 5. LendingPool (depends on all others)
 * 6. CommodityVerifier (depends on Registry, Token)
 * 7. Wire permissions and ownership
 *
 * Usage:
 * forge script script/DeployAll.s.sol:DeployAll --rpc-url sepolia --broadcast --verify
 */
contract DeployAll is Script {
    /*//////////////////////////////////////////////////////////////
                        DEPLOYMENT STATE
    //////////////////////////////////////////////////////////////*/

    CommodityRegistry public registry;
    CommodityPriceOracle public oracle;
    CommodityToken public commodityToken;
    LiquidityShareToken public shareToken;
    CommodityVerifier public verifier;
    LendingPool public lendingPool;

    // Mock USDC for testing
    address public constant USDC_SEPOLIA = 0x6F14C02FC1f78322CFD7D50A24b7A3F2f2b1b2F3;

    function run() external {
        // Get deployer
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying AgriDeFi Protocol from:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Deploy CommodityRegistry
        console.log("\n=== Deploying CommodityRegistry ===");
        registry = new CommodityRegistry();
        console.log("CommodityRegistry deployed at:", address(registry));

        // Step 2: Deploy CommodityPriceOracle
        console.log("\n=== Deploying CommodityPriceOracle ===");
        oracle = new CommodityPriceOracle();
        console.log("CommodityPriceOracle deployed at:", address(oracle));

        // Step 3: Deploy CommodityToken (temporary verifier address)
        console.log("\n=== Deploying CommodityToken ===");
        commodityToken = new CommodityToken(
            "ipfs://QmXxxx", // Base URI
            deployer, // Temporary verifier
            deployer // Temporary lending pool
        );
        console.log("CommodityToken deployed at:", address(commodityToken));

        // Step 4: Deploy LiquidityShareToken (temporary lending pool)
        console.log("\n=== Deploying LiquidityShareToken ===");
        shareToken = new LiquidityShareToken(deployer); // Temporary
        console.log("LiquidityShareToken deployed at:", address(shareToken));

        // Step 5: Deploy LendingPool
        console.log("\n=== Deploying LendingPool ===");
        lendingPool = new LendingPool(
            USDC_SEPOLIA, // USDC address
            address(registry),
            address(commodityToken),
            address(shareToken),
            address(oracle)
        );
        console.log("LendingPool deployed at:", address(lendingPool));

        // Step 6: Deploy CommodityVerifier
        console.log("\n=== Deploying CommodityVerifier ===");
        verifier = new CommodityVerifier(address(registry), address(commodityToken));
        console.log("CommodityVerifier deployed at:", address(verifier));

        // Step 7: Wire permissions
        console.log("\n=== Wiring Permissions ===");

        // Update CommodityToken with correct addresses
        commodityToken.setVerifier(address(verifier));
        commodityToken.setLendingPool(address(lendingPool));
        console.log("CommodityToken: Set verifier and lending pool");

        // Update LiquidityShareToken with correct address
        shareToken.setLendingPool(address(lendingPool));
        console.log("LiquidityShareToken: Set lending pool");

        // Add verifier to registry
        registry.addVerifier(address(verifier));
        console.log("Registry: Added verifier");

        vm.stopBroadcast();

        // Output summary
        console.log("\n=== DEPLOYMENT COMPLETE ===");
        console.log("CommodityRegistry:", address(registry));
        console.log("CommodityPriceOracle:", address(oracle));
        console.log("CommodityToken:", address(commodityToken));
        console.log("LiquidityShareToken:", address(shareToken));
        console.log("CommodityVerifier:", address(verifier));
        console.log("LendingPool:", address(lendingPool));
        console.log("Deployer:", deployer);
        console.log("\nNext steps:");
        console.log("1. Add farmer accounts as recipients");
        console.log("2. Set commodity prices in oracle");
        console.log("3. Have farmers register commodities");
        console.log("4. Have verifier approve commodities");
        console.log("5. Have investors deposit USDC");
        console.log("6. Have farmers borrow against collateral");
    }
}
