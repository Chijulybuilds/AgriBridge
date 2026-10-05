// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";

import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {CommodityToken} from "src/CommodityToken.sol";
import {CommodityPriceOracle} from "src/CommodityPriceOracle.sol";
import {AgriShareToken} from "src/AgriShareToken.sol";
import {LendingPool} from "src/LendingPool.sol";
import {ICommodityPriceOracle} from "src/interfaces/ICommodityPriceOracle.sol";
import {DemoUSDC} from "src/demo/DemoUSDC.sol";

/**
 * @title DeployDemo
 * @notice Deploys a self-contained demo of the protocol with play money: a faucet USDC, fresh
 *         prices, and three demo accounts (verifier, farmer, investor) ready to use.
 * @dev Same wiring as DeployAll, plus:
 *      - DemoUSDC instead of real USDC, and dUSDC handed to each demo account;
 *      - the demo verifier gets the day-to-day roles (verify, update prices, liquidate) but not
 *        DEFAULT_ADMIN_ROLE, which stays with the deployer, so a demo key that ends up public
 *        cannot take over the contracts;
 *      - a long price heartbeat, so prices do not go stale in the middle of a demo;
 *      - the deployer seeds the pool, so farmers can borrow straight away.
 *
 *      Environment (all optional; the defaults are Anvil's public test accounts #1-#3):
 *      DEMO_VERIFIER, DEMO_FARMER, DEMO_INVESTOR, PRICE_HEARTBEAT_SECONDS, SEED_LIQUIDITY,
 *      TOKEN_METADATA_BASE_URI.
 *
 *      Local:   npm run demo   (starts anvil, runs this, starts the app)
 *      Sepolia: see DEMO.md
 */
contract DeployDemo is Script {
    /// @dev Initial prices, 8 decimals, in USD per kilogram (same as DeployAll).
    uint128 internal constant COCOA_PRICE = 650 * 10 ** 6; // $6.50
    uint128 internal constant RICE_PRICE = 120 * 10 ** 6; // $1.20
    uint128 internal constant MAIZE_PRICE = 45 * 10 ** 6; // $0.45
    uint128 internal constant CASHEW_PRICE = 320 * 10 ** 6; // $3.20
    uint128 internal constant YAM_PRICE = 85 * 10 ** 6; // $0.85

    /// @dev Anvil's default accounts #1-#3. Public test keys: worthless anywhere else.
    address internal constant ANVIL_1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address internal constant ANVIL_2 = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
    address internal constant ANVIL_3 = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;

    /// @dev dUSDC handed out at deploy time.
    uint256 internal constant VERIFIER_FUNDS = 50_000e6; // pays debts when liquidating
    uint256 internal constant FARMER_FUNDS = 2_000e6; // covers interest on top of a loan
    uint256 internal constant INVESTOR_FUNDS = 50_000e6;

    struct Deployment {
        DemoUSDC usdc;
        CommodityRegistry registry;
        CommodityToken commodityToken;
        CommodityPriceOracle oracle;
        AgriShareToken shareToken;
        LendingPool pool;
    }

    function run() external returns (Deployment memory d) {
        address verifier = vm.envOr("DEMO_VERIFIER", ANVIL_1);
        address farmer = vm.envOr("DEMO_FARMER", ANVIL_2);
        address investor = vm.envOr("DEMO_INVESTOR", ANVIL_3);
        uint256 heartbeat = vm.envOr("PRICE_HEARTBEAT_SECONDS", uint256(365 days));
        uint256 seedLiquidity = vm.envOr("SEED_LIQUIDITY", uint256(50_000e6));
        string memory baseUri = vm.envOr("TOKEN_METADATA_BASE_URI", string("https://agribridge.demo/metadata/"));

        vm.startBroadcast();
        // The broadcasting account, both under `forge script` and when a test runs this script.
        (, address deployer,) = vm.readCallers();

        // 1. Play money, then the protocol in the same order as DeployAll.
        d.usdc = new DemoUSDC();
        d.registry = new CommodityRegistry(deployer);
        d.commodityToken = new CommodityToken(deployer, address(d.registry), baseUri);
        d.oracle = new CommodityPriceOracle(deployer, heartbeat);
        d.shareToken = new AgriShareToken(address(d.usdc), "agUSDC", "aU");
        d.pool = new LendingPool(
            deployer,
            address(d.usdc),
            address(d.registry),
            address(d.commodityToken),
            address(d.shareToken),
            address(d.oracle)
        );

        // 2. Wiring, as in DeployAll.
        d.shareToken.setLendingPool(address(d.pool));
        d.registry.setCommodityTokenAddress(address(d.commodityToken));
        d.registry.setLendingPoolAddress(address(d.pool));
        d.registry.grantRole(d.registry.POOL_ROLE(), address(d.pool));
        d.oracle.setCommodityRegistry(address(d.registry));

        // 3. The demo verifier runs the admin side of the demo.
        d.registry.grantRole(d.registry.VERIFIER_ROLE(), verifier);
        d.oracle.grantRole(d.oracle.PRICE_UPDATER_ROLE(), verifier);
        d.pool.grantRole(d.pool.LIQUIDATOR_ROLE(), verifier);

        // 4. Prices, valid for `heartbeat` seconds.
        d.oracle.setPrice(ICommodityPriceOracle.CommodityType.Cocoa, COCOA_PRICE);
        d.oracle.setPrice(ICommodityPriceOracle.CommodityType.Rice, RICE_PRICE);
        d.oracle.setPrice(ICommodityPriceOracle.CommodityType.Maize, MAIZE_PRICE);
        d.oracle.setPrice(ICommodityPriceOracle.CommodityType.Cashew, CASHEW_PRICE);
        d.oracle.setPrice(ICommodityPriceOracle.CommodityType.Yam, YAM_PRICE);

        // 5. Play money for each account, and starting liquidity so loans work at once.
        d.usdc.faucet(verifier, VERIFIER_FUNDS);
        d.usdc.faucet(farmer, FARMER_FUNDS);
        d.usdc.faucet(investor, INVESTOR_FUNDS);
        if (seedLiquidity > 0) {
            d.usdc.faucet(deployer, seedLiquidity);
            d.usdc.approve(address(d.pool), seedLiquidity);
            d.pool.deposit(seedLiquidity);
        }

        vm.stopBroadcast();

        console.log("=== AgriBridge demo deployed (play money only) ===");
        console.log("NEXT_PUBLIC_COMMODITY_REGISTRY_ADDRESS=%s", address(d.registry));
        console.log("NEXT_PUBLIC_COMMODITY_TOKEN_ADDRESS=%s", address(d.commodityToken));
        console.log("NEXT_PUBLIC_COMMODITY_PRICE_ORACLE_ADDRESS=%s", address(d.oracle));
        console.log("NEXT_PUBLIC_AGRI_SHARE_TOKEN_ADDRESS=%s", address(d.shareToken));
        console.log("NEXT_PUBLIC_LENDING_POOL_ADDRESS=%s", address(d.pool));
        console.log("NEXT_PUBLIC_USDC_ADDRESS=%s", address(d.usdc));
        console.log("Demo verifier: %s", verifier);
        console.log("Demo farmer:   %s", farmer);
        console.log("Demo investor: %s", investor);
    }
}
