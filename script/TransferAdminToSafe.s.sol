// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {CommodityRegistry} from "src/CommodityRegistry.sol";
import {CommodityToken} from "src/CommodityToken.sol";
import {CommodityPriceOracle} from "src/CommodityPriceOracle.sol";
import {LendingPool} from "src/LendingPool.sol";

/**
 * @title TransferAdminToSafe
 * @notice Grants every role to the Safe and revokes them from the deployer /
 *         previous-holder addresses, handling the case where multiple addresses
 *         resolve to the same wallet (e.g. broadcaster == previousAdmin).
 *
 * ORDER MATTERS: non-admin roles must be revoked BEFORE DEFAULT_ADMIN_ROLE,
 * otherwise the caller loses the admin power needed to revoke sub-roles.
 */
contract TransferAdminToSafe is Script {
    function run() external {
        address safe = vm.envAddress("ADMIN_ADDRESS");
        address previousAdmin = vm.envAddress("PREVIOUS_ADMIN_ADDRESS");
        address previousVerifier = vm.envOr(
            "PREVIOUS_VERIFIER_ADDRESS",
            address(0)
        );
        CommodityRegistry registry = CommodityRegistry(
            vm.envAddress("REGISTRY_ADDRESS")
        );
        CommodityToken commodityToken = CommodityToken(
            vm.envAddress("TOKEN_ADDRESS")
        );
        CommodityPriceOracle oracle = CommodityPriceOracle(
            vm.envAddress("PRICE_ORACLE_ADDRESS")
        );
        LendingPool pool = LendingPool(
            payable(vm.envAddress("LENDING_POOL_ADDRESS"))
        );

        require(
            safe != address(0) && previousAdmin != address(0),
            "invalid admin address"
        );

        vm.startBroadcast();

        // ── CommodityRegistry ──────────────────────────────────────────
        // Grant all roles to Safe FIRST
        registry.grantRole(registry.DEFAULT_ADMIN_ROLE(), safe);
        registry.grantRole(registry.VERIFIER_ROLE(), safe);
        // Revoke sub-roles before admin so we still have the caller's permission
        _revokeIfHasRole(registry, registry.VERIFIER_ROLE(), previousVerifier);
        _revokeIfHasRole(registry, registry.VERIFIER_ROLE(), previousAdmin);
        // Admin LAST
        _revokeIfHasRole(registry, registry.DEFAULT_ADMIN_ROLE(), previousAdmin);

        // ── CommodityToken ─────────────────────────────────────────────
        commodityToken.grantRole(commodityToken.DEFAULT_ADMIN_ROLE(), safe);
        _revokeIfHasRole(commodityToken, commodityToken.DEFAULT_ADMIN_ROLE(), previousAdmin);

        // ── CommodityPriceOracle ───────────────────────────────────────
        // Grant all roles FIRST
        oracle.grantRole(oracle.DEFAULT_ADMIN_ROLE(), safe);
        oracle.grantRole(oracle.PRICE_UPDATER_ROLE(), safe);
        // Revoke sub-role before admin
        _revokeIfHasRole(oracle, oracle.PRICE_UPDATER_ROLE(), previousAdmin);
        // Admin LAST
        _revokeIfHasRole(oracle, oracle.DEFAULT_ADMIN_ROLE(), previousAdmin);

        // ── LendingPool ────────────────────────────────────────────────
        // Grant all roles FIRST
        pool.grantRole(pool.DEFAULT_ADMIN_ROLE(), safe);
        pool.grantRole(pool.ADMIN_ROLE(), safe);
        // Revoke sub-role before admin
        _revokeIfHasRole(pool, pool.ADMIN_ROLE(), previousAdmin);
        // Admin LAST
        _revokeIfHasRole(pool, pool.DEFAULT_ADMIN_ROLE(), previousAdmin);

        vm.stopBroadcast();
    }

    /// @notice Revoke only if the account currently holds the role (so we
    ///         never attempt a second revoke after the caller lost admin).
    function _revokeIfHasRole(
        CommodityRegistry c,
        bytes32 role,
        address account
    ) internal {
        if (account != address(0) && c.hasRole(role, account)) {
            c.revokeRole(role, account);
        }
    }

    function _revokeIfHasRole(
        CommodityToken c,
        bytes32 role,
        address account
    ) internal {
        if (account != address(0) && c.hasRole(role, account)) {
            c.revokeRole(role, account);
        }
    }

    function _revokeIfHasRole(
        CommodityPriceOracle c,
        bytes32 role,
        address account
    ) internal {
        if (account != address(0) && c.hasRole(role, account)) {
            c.revokeRole(role, account);
        }
    }

    function _revokeIfHasRole(
        LendingPool p,
        bytes32 role,
        address account
    ) internal {
        if (account != address(0) && p.hasRole(role, account)) {
            p.revokeRole(role, account);
        }
    }
}
