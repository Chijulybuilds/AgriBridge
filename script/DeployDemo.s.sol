// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {DemoUSDC} from "src/demo/DemoUSDC.sol";
import {ProtocolDeployer} from "script/ProtocolDeployer.sol";

/**
 * @title DeployDemo
 * @notice Deploys a self-contained demo of the protocol with play money: a faucet USDC, fresh
 *         prices, two demo warehouses, starting liquidity, and funded farmer and investor accounts.
 * @dev Same wiring and handover as DeployAll, plus:
 *      - DemoUSDC instead of real USDC, and dUSDC handed to each demo account;
 *      - a long price heartbeat, so prices do not go stale in the middle of a demo;
 *      - the deployer seeds the pool, so farmers can borrow straight away.
 *      The verifier is the AgriBridge Safe, as in production; locally, tests act as its address.
 *
 *      Environment (all optional): VERIFIER_ADDRESS (defaults to the Safe), ADMIN_ADDRESS (defaults
 *      to VERIFIER_ADDRESS), DEMO_FARMER, DEMO_INVESTOR (default to Anvil's public accounts #2 and
 *      #3), PRICE_HEARTBEAT_SECONDS, SEED_LIQUIDITY.
 *
 *      Sepolia: see DEMO.md
 */
contract DeployDemo is Script, ProtocolDeployer {
    /// @dev The AgriBridge verifier Safe on Sepolia.
    address internal constant VERIFIER_SAFE = 0xDa152AfD8C2efDA383fde6F840f590C93738de12;

    /// @dev Anvil's default accounts #2 and #3. Public test keys: worthless anywhere else.
    address internal constant ANVIL_2 = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
    address internal constant ANVIL_3 = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;

    /// @dev dUSDC handed out at deploy time.
    uint256 internal constant VERIFIER_FUNDS = 50_000e6; // pays debts when liquidating
    uint256 internal constant FARMER_FUNDS = 2_000e6; // covers interest on top of a loan
    uint256 internal constant INVESTOR_FUNDS = 50_000e6;

    /// @dev Protocol reserves the keeper can liquidate with, so the backstop works in the demo.
    uint256 internal constant RESERVE_SEED = 10_000e6;

    /// @dev Demo warehouse capacity: 5,000 metric tons each (18-decimal kilograms).
    uint96 internal constant DEMO_WAREHOUSE_CAPACITY = 5_000_000e18;

    function run() external returns (Deployment memory d) {
        address verifier = vm.envOr("VERIFIER_ADDRESS", VERIFIER_SAFE);
        address finalAdmin = vm.envOr("ADMIN_ADDRESS", verifier);
        address farmer = vm.envOr("DEMO_FARMER", ANVIL_2);
        address investor = vm.envOr("DEMO_INVESTOR", ANVIL_3);
        uint256 heartbeat = vm.envOr("PRICE_HEARTBEAT_SECONDS", uint256(365 days));
        uint256 seedLiquidity = vm.envOr("SEED_LIQUIDITY", uint256(50_000e6));

        vm.startBroadcast();
        // The broadcasting account, both under `forge script` and when a test runs this script.
        (, address deployer,) = vm.readCallers();

        // 1. Play money, then the protocol with the same wiring as DeployAll.
        DemoUSDC usdc = new DemoUSDC();
        d = _deployProtocol(deployer, address(usdc), heartbeat);
        _seedCommodities(d);

        // 2. Demo verifier stations, added while the deployer is still admin.
        d.registry.addWarehouse("Demo Warehouse - Ibadan", "Oyo, Nigeria", DEMO_WAREHOUSE_CAPACITY);
        d.registry.addWarehouse("Demo Warehouse - Kano", "Kano, Nigeria", DEMO_WAREHOUSE_CAPACITY);

        // 3. Play money for each account, and starting liquidity so loans work at once.
        usdc.faucet(verifier, VERIFIER_FUNDS);
        usdc.faucet(farmer, FARMER_FUNDS);
        usdc.faucet(investor, INVESTOR_FUNDS);
        if (seedLiquidity > 0) {
            usdc.faucet(deployer, seedLiquidity);
            usdc.approve(address(d.pool), seedLiquidity);
            d.pool.deposit(seedLiquidity);
        }
        usdc.faucet(deployer, RESERVE_SEED);
        usdc.approve(address(d.pool), RESERVE_SEED);
        d.pool.depositReserves(RESERVE_SEED);

        // 4. The Safe becomes the only verifier and takes over every admin role.
        _handOver(d, deployer, verifier, finalAdmin);

        vm.stopBroadcast();

        console.log("=== AgriBridge demo deployed (play money only) ===");
        console.log("NEXT_PUBLIC_COMMODITY_CONFIG_ADDRESS=%s", address(d.config));
        console.log("NEXT_PUBLIC_COMMODITY_REGISTRY_ADDRESS=%s", address(d.registry));
        console.log("NEXT_PUBLIC_COMMODITY_TOKEN_ADDRESS=%s", address(d.commodityToken));
        console.log("NEXT_PUBLIC_COMMODITY_PRICE_ORACLE_ADDRESS=%s", address(d.oracle));
        console.log("NEXT_PUBLIC_AGRI_SHARE_TOKEN_ADDRESS=%s", address(d.shareToken));
        console.log("NEXT_PUBLIC_LENDING_POOL_ADDRESS=%s", address(d.pool));
        console.log("NEXT_PUBLIC_LIQUIDATION_KEEPER_ADDRESS=%s", address(d.keeper));
        console.log("NEXT_PUBLIC_MARKETPLACE_ADDRESS=%s", address(d.marketplace));
        console.log("NEXT_PUBLIC_WAREHOUSE_DESK_ADDRESS=%s", address(d.desk));
        console.log("NEXT_PUBLIC_USDC_ADDRESS=%s", address(usdc));
        console.log("NEXT_PUBLIC_VERIFIER_SAFE=%s", verifier);
        console.log("Demo farmer:   %s", farmer);
        console.log("Demo investor: %s", investor);
    }
}
