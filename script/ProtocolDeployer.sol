// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CommodityConfig} from "src/CommodityConfig.sol";
import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {CommodityToken} from "src/CommodityToken.sol";
import {CommodityPriceOracle} from "src/CommodityPriceOracle.sol";
import {AgriShareToken} from "src/AgriShareToken.sol";
import {LendingPool} from "src/LendingPool.sol";
import {LiquidationKeeper} from "src/LiquidationKeeper.sol";
import {Marketplace} from "src/Marketplace.sol";
import {WarehouseDesk} from "src/WarehouseDesk.sol";
import {FunctionsPriceFeeder} from "src/oracle/FunctionsPriceFeeder.sol";
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
        LiquidationKeeper keeper;
        Marketplace marketplace;
        WarehouseDesk desk;
        /// @dev Zero unless a Chainlink Functions router was given.
        FunctionsPriceFeeder feeder;
        address usdc;
    }

    /**
     * @dev Starting prices in USD per kilogram (8 decimals), in CommodityDefaults order. The festival
     *      demo runs no live price feed, so these hold until the Safe changes them. The export crops
     *      use world futures prices on 6 Oct 2026 (ICE cocoa; CBOT rough rice, corn and soybeans);
     *      cashew and yam are local estimates. Tests pin their own prices instead (see ProtocolFixture).
     */
    function _startingPrices() internal pure virtual returns (uint128[] memory prices) {
        prices = new uint128[](CommodityDefaults.COUNT);
        prices[0] = 585 * 10 ** 6; // Cocoa $5.85
        prices[1] = 36 * 10 ** 6; // Rice $0.36
        prices[2] = 20 * 10 ** 6; // Maize $0.20
        prices[3] = 320 * 10 ** 6; // Cashew $3.20
        prices[4] = 85 * 10 ** 6; // Yam $0.85
        prices[5] = 47 * 10 ** 6; // Soybeans $0.47
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
            _deployer,
            _usdc,
            address(d.registry),
            address(d.commodityToken),
            address(d.shareToken),
            address(d.oracle),
            address(d.config)
        );
        d.keeper = new LiquidationKeeper(address(d.pool));
        d.marketplace = new Marketplace(
            _deployer, _usdc, address(d.commodityToken), address(d.registry), address(d.oracle), _deployer
        );
        d.desk = new WarehouseDesk(_deployer, _deployer, _usdc, address(d.commodityToken), d.registry, _deployer);

        // Without these the contracts deploy but cannot mint, lend, return collateral, backstop,
        // trade or release stock.
        d.shareToken.setLendingPool(address(d.pool));
        d.registry.setCommodityTokenAddress(address(d.commodityToken));
        d.pool.grantRole(d.pool.KEEPER_ROLE(), address(d.keeper));
        bytes32 protocolRole = d.commodityToken.PROTOCOL_ROLE();
        d.commodityToken.grantRole(protocolRole, address(d.pool));
        d.commodityToken.grantRole(protocolRole, address(d.marketplace));
        d.commodityToken.grantRole(protocolRole, address(d.desk));
        d.commodityToken.grantRole(d.commodityToken.BURNER_ROLE(), address(d.desk));
        d.registry.grantRole(d.registry.CUSTODY_ROLE(), address(d.desk));
    }

    /**
     * @dev Deploys the Chainlink Functions feeder for the world-priced commodities and lets it push
     *      prices. The Safe sets its subscription and DON settings afterwards (they need testnet LINK)
     *      and the price providers in its JavaScript source.
     */
    function _deployFeeder(Deployment memory d, address _router, address _deployer, string memory _source) internal {
        d.feeder = new FunctionsPriceFeeder(_router, address(d.oracle), _deployer);
        d.oracle.grantRole(d.oracle.PRICE_UPDATER_ROLE(), address(d.feeder));

        uint256[] memory ids = new uint256[](4);
        string[] memory symbols = new string[](4);
        (ids[0], symbols[0]) = (CommodityDefaults.COCOA, "COCOA");
        (ids[1], symbols[1]) = (CommodityDefaults.RICE, "RICE");
        (ids[2], symbols[2]) = (CommodityDefaults.MAIZE, "CORN");
        (ids[3], symbols[3]) = (CommodityDefaults.SOYBEANS, "SOYBEANS");
        d.feeder.setCommodities(ids, symbols);
        if (bytes(_source).length > 0) d.feeder.setSource(_source);
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
     *      `_deployer` to `_finalAdmin` and renounces the deployer's roles, so the deploy key holds
     *      nothing once deployment ends.
     */
    function _handOver(Deployment memory d, address _deployer, address _verifier, address _finalAdmin) internal {
        // The verifier also runs the warehouses, so it confirms releases at the desk.
        d.registry.grantRole(d.registry.VERIFIER_ROLE(), _verifier);
        bytes32 custodianRole = d.desk.CUSTODIAN_ROLE();
        d.desk.grantRole(custodianRole, _verifier);
        if (_verifier != _deployer) d.desk.renounceRole(custodianRole, _deployer);

        if (_finalAdmin == _deployer) return;

        bytes32 adminRole = 0x00; // DEFAULT_ADMIN_ROLE, identical in every contract

        d.config.grantRole(adminRole, _finalAdmin);
        d.registry.grantRole(adminRole, _finalAdmin);
        d.commodityToken.grantRole(adminRole, _finalAdmin);
        d.oracle.grantRole(adminRole, _finalAdmin);
        d.oracle.grantRole(d.oracle.PRICE_UPDATER_ROLE(), _finalAdmin);
        d.pool.grantRole(adminRole, _finalAdmin);
        d.marketplace.grantRole(adminRole, _finalAdmin);
        d.marketplace.grantRole(d.marketplace.CLEARANCE_ROLE(), _finalAdmin);
        d.marketplace.setFees(d.marketplace.feeBps(), _finalAdmin, d.marketplace.clearanceDiscountBps());
        d.desk.grantRole(adminRole, _finalAdmin);
        d.desk.setFeeRecipient(_finalAdmin);
        if (address(d.feeder) != address(0)) {
            d.feeder.grantRole(adminRole, _finalAdmin);
            d.feeder.renounceRole(adminRole, _deployer);
        }

        d.oracle.renounceRole(d.oracle.PRICE_UPDATER_ROLE(), _deployer);
        d.marketplace.renounceRole(d.marketplace.CLEARANCE_ROLE(), _deployer);
        d.marketplace.renounceRole(adminRole, _deployer);
        d.desk.renounceRole(adminRole, _deployer);
        d.config.renounceRole(adminRole, _deployer);
        d.registry.renounceRole(adminRole, _deployer);
        d.commodityToken.renounceRole(adminRole, _deployer);
        d.oracle.renounceRole(adminRole, _deployer);
        d.pool.renounceRole(adminRole, _deployer);
    }

    /**
     * @dev Stops the deployment if any role ended up in the wrong hands: the verifier must be the only
     *      verifier and the warehouses' custodian, and after a handover the final admin must hold
     *      every admin role while the deployer holds none.
     */
    function _checkHandOver(Deployment memory d, address _deployer, address _verifier, address _finalAdmin)
        internal
        view
    {
        require(d.registry.verifier() == _verifier, "handover: verifier");
        require(d.desk.hasRole(d.desk.CUSTODIAN_ROLE(), _verifier), "handover: custodian");
        if (_finalAdmin == _deployer) return;

        bytes32 adminRole = 0x00;
        require(
            d.config.hasRole(adminRole, _finalAdmin) && d.registry.hasRole(adminRole, _finalAdmin)
                && d.commodityToken.hasRole(adminRole, _finalAdmin) && d.oracle.hasRole(adminRole, _finalAdmin)
                && d.pool.hasRole(adminRole, _finalAdmin) && d.marketplace.hasRole(adminRole, _finalAdmin)
                && d.desk.hasRole(adminRole, _finalAdmin),
            "handover: final admin is missing a role"
        );
        require(
            !d.config.hasRole(adminRole, _deployer) && !d.registry.hasRole(adminRole, _deployer)
                && !d.commodityToken.hasRole(adminRole, _deployer) && !d.oracle.hasRole(adminRole, _deployer)
                && !d.oracle.hasRole(d.oracle.PRICE_UPDATER_ROLE(), _deployer) && !d.pool.hasRole(adminRole, _deployer)
                && !d.marketplace.hasRole(adminRole, _deployer)
                && !d.marketplace.hasRole(d.marketplace.CLEARANCE_ROLE(), _deployer)
                && !d.desk.hasRole(adminRole, _deployer) && !d.desk.hasRole(d.desk.CUSTODIAN_ROLE(), _deployer),
            "handover: the deployer kept a role"
        );
        if (address(d.feeder) != address(0)) {
            require(d.feeder.hasRole(adminRole, _finalAdmin), "handover: feeder admin");
            require(!d.feeder.hasRole(adminRole, _deployer), "handover: deployer kept the feeder");
        }
    }
}
