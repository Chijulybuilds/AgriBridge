// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CommodityConfig} from "src/CommodityConfig.sol";
import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {CommodityToken} from "src/CommodityToken.sol";
import {CommodityPriceOracle} from "src/CommodityPriceOracle.sol";
import {AgriShareToken} from "src/AgriShareToken.sol";
import {LendingPool} from "src/LendingPool.sol";
import {CommodityDefaults} from "script/CommodityDefaults.sol";

/**
 * @title ProtocolDeployer
 * @notice Deployment steps shared by DeployAll (real USDC) and DeployDemo (play money): deploy,
 *         wire, seed the commodities and their prices, then hand every admin role to the Safe.
 * @dev Call these inside a broadcast. `_deployer` is the broadcasting account, which holds the admin
 *      roles until `_handOver` moves them to the final admin and renounces its own.
 */
abstract contract ProtocolDeployer {
    struct Deployment {
        CommodityConfig config;
        CommodityRegistry registry;
        CommodityToken commodityToken;
        CommodityPriceOracle oracle;
        AgriShareToken shareToken;
        LendingPool pool;
        address usdc;
    }

    /// @dev Starting prices in USD per kilogram (8 decimals), in CommodityDefaults order.
    function _startingPrices() internal pure returns (uint128[] memory prices) {
        prices = new uint128[](CommodityDefaults.COUNT);
        prices[0] = 650 * 10 ** 6; // Cocoa $6.50
        prices[1] = 120 * 10 ** 6; // Rice $1.20
        prices[2] = 45 * 10 ** 6; // Maize $0.45
        prices[3] = 320 * 10 ** 6; // Cashew $3.20
        prices[4] = 85 * 10 ** 6; // Yam $0.85
        prices[5] = 40 * 10 ** 6; // Soybeans $0.40
    }

    /// @dev Deploys every contract and wires them together, with `_deployer` as the temporary admin.
    function _deployProtocol(address _deployer, address _usdc, uint256 _heartbeat)
        internal
        returns (Deployment memory d)
    {
        d.usdc = _usdc;
        d.config = new CommodityConfig(_deployer);
        d.registry = new CommodityRegistry(_deployer, d.config);
        d.commodityToken = new CommodityToken(_deployer, d.registry);
        d.oracle = new CommodityPriceOracle(_deployer, d.config, _heartbeat);
        d.shareToken = new AgriShareToken(_usdc, "agUSDC", "aU");
        d.pool = new LendingPool(
            _deployer, _usdc, address(d.registry), address(d.commodityToken), address(d.shareToken), address(d.oracle)
        );

        // Without these the contracts deploy but cannot mint, lend or return collateral.
        d.shareToken.setLendingPool(address(d.pool));
        d.registry.setCommodityTokenAddress(address(d.commodityToken));
        d.commodityToken.grantRole(d.commodityToken.PROTOCOL_ROLE(), address(d.pool));
    }

    /**
     * @dev Adds the six launch commodities and seeds their starting prices. Seeding uses the admin's
     *      `forcePrice`, since locally priced crops only otherwise take prices from their reporters.
     */
    function _seedCommodities(Deployment memory d) internal {
        CommodityConfig.Commodity[] memory rows = CommodityDefaults.all();
        uint128[] memory prices = _startingPrices();
        for (uint256 i = 0; i < rows.length; i++) {
            d.oracle.forcePrice(d.config.addCommodity(rows[i]), prices[i]);
        }
    }

    /**
     * @dev Makes `_verifier` the registry's only verifier, then moves every admin role from
     *      `_deployer` to `_finalAdmin` and renounces the deployer's roles, including the liquidator
     *      role the pool's constructor gives it (the old handover left that one behind).
     */
    function _handOver(Deployment memory d, address _deployer, address _verifier, address _finalAdmin) internal {
        d.registry.grantRole(d.registry.VERIFIER_ROLE(), _verifier);

        if (_finalAdmin == _deployer) return;

        bytes32 adminRole = 0x00; // DEFAULT_ADMIN_ROLE, identical in every contract

        d.config.grantRole(adminRole, _finalAdmin);
        d.registry.grantRole(adminRole, _finalAdmin);
        d.commodityToken.grantRole(adminRole, _finalAdmin);
        d.oracle.grantRole(adminRole, _finalAdmin);
        d.oracle.grantRole(d.oracle.PRICE_UPDATER_ROLE(), _finalAdmin);
        d.pool.grantRole(adminRole, _finalAdmin);
        d.pool.grantRole(d.pool.ADMIN_ROLE(), _finalAdmin);
        d.pool.grantRole(d.pool.LIQUIDATOR_ROLE(), _finalAdmin);

        d.oracle.renounceRole(d.oracle.PRICE_UPDATER_ROLE(), _deployer);
        d.pool.renounceRole(d.pool.LIQUIDATOR_ROLE(), _deployer);
        d.pool.renounceRole(d.pool.ADMIN_ROLE(), _deployer);
        d.config.renounceRole(adminRole, _deployer);
        d.registry.renounceRole(adminRole, _deployer);
        d.commodityToken.renounceRole(adminRole, _deployer);
        d.oracle.renounceRole(adminRole, _deployer);
        d.pool.renounceRole(adminRole, _deployer);
    }
}
