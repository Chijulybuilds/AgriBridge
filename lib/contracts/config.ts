import { keccak256, toHex, type Address, type Hex } from "viem";

/**
 * Deployed contract addresses, read from the environment so a redeploy is a
 * configuration change rather than a code change. The deploy scripts
 * (`make deploy-all`, `npm run demo:sepolia`) print every value this file expects.
 */
function address(value: string | undefined): Address | undefined {
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) return undefined;
  return value as Address;
}

export const contracts = {
  config: address(process.env.NEXT_PUBLIC_COMMODITY_CONFIG_ADDRESS),
  registry: address(process.env.NEXT_PUBLIC_COMMODITY_REGISTRY_ADDRESS),
  token: address(process.env.NEXT_PUBLIC_COMMODITY_TOKEN_ADDRESS),
  oracle: address(process.env.NEXT_PUBLIC_COMMODITY_PRICE_ORACLE_ADDRESS),
  shareToken: address(process.env.NEXT_PUBLIC_AGRI_SHARE_TOKEN_ADDRESS),
  pool: address(process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS),
  keeper: address(process.env.NEXT_PUBLIC_LIQUIDATION_KEEPER_ADDRESS),
  marketplace: address(process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS),
  desk: address(process.env.NEXT_PUBLIC_WAREHOUSE_DESK_ADDRESS),
  usdc: address(process.env.NEXT_PUBLIC_USDC_ADDRESS),
} as const;

export type ContractName = keyof typeof contracts;

/**
 * The verifier Safe: the only wallet the contracts grant VERIFIER_ROLE, and the
 * only one the hidden /verifier page opens for.
 */
export const VERIFIER_SAFE = address(process.env.NEXT_PUBLIC_VERIFIER_SAFE);

/** Block the contracts were deployed in, so event scans do not start from genesis. */
export const DEPLOY_BLOCK = process.env.NEXT_PUBLIC_DEPLOY_BLOCK
  ? BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK)
  : undefined;

/**
 * Reads an address, failing loudly when it is unset.
 *
 * Calling a contract at `undefined` produces a confusing wallet error far from
 * the cause; naming the missing variable makes a misconfigured deployment
 * obvious immediately.
 */
export function requireContract(name: ContractName): Address {
  const value = contracts[name];
  if (!value) {
    throw new Error(
      `Contract address for "${name}" is not configured. ` +
        `Set the matching NEXT_PUBLIC_* variable in .env.local (see .env.example).`,
    );
  }
  return value;
}

/** True when every address the app needs is present. */
export function contractsConfigured(): boolean {
  return Object.values(contracts).every(Boolean);
}

/** Names of the addresses that are missing, for diagnostics in the UI. */
export function missingContracts(): ContractName[] {
  return (Object.keys(contracts) as ContractName[]).filter((k) => !contracts[k]);
}

/*//////////////////////////////////////////////////////////////
                              ROLES
//////////////////////////////////////////////////////////////*/

const role = (name: string): Hex => keccak256(toHex(name));

export const DEFAULT_ADMIN_ROLE: Hex = `0x${"00".repeat(32)}`;
/** CommodityRegistry: approves or rejects intake. Held by the Safe alone. */
export const VERIFIER_ROLE = role("VERIFIER_ROLE");
/** CommodityRegistry: freezes lots and warehouses. */
export const REGULATOR_ROLE = role("REGULATOR_ROLE");
/** WarehouseDesk: confirms that goods left the warehouse. */
export const CUSTODIAN_ROLE = role("CUSTODIAN_ROLE");
/** Marketplace: lists stock bought through clearance. */
export const CLEARANCE_ROLE = role("CLEARANCE_ROLE");

/*//////////////////////////////////////////////////////////////
                    ON-CHAIN ENUM MAPPINGS
//////////////////////////////////////////////////////////////*/
// Order must match the Solidity enums: the contracts take and return uint8 indexes.

/** CommodityRegistry.Grade */
export const GRADES = ["A", "B", "C"] as const;
export type Grade = (typeof GRADES)[number];

/** CommodityRegistry.LotStatus */
export const LOT_STATUSES = ["Pending", "Verified", "Rejected", "Cancelled"] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];

/** LendingPool.LoanStatus */
export const LOAN_STATUSES = ["Active", "Repaid", "Liquidated"] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

/** WarehouseDesk.RequestStatus */
export const REQUEST_STATUSES = ["Pending", "Released", "Cancelled", "Rejected"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** CommodityConfig.PriceSource */
export const PRICE_SOURCES = ["World price", "Local price"] as const;

/** Marketplace.PriceMode */
export const PriceMode = { Fixed: 0, Reference: 1 } as const;

/*//////////////////////////////////////////////////////////////
                            UNITS
//////////////////////////////////////////////////////////////*/

/** USDC and the pool's shares use 6 decimals. */
export const USDC_DECIMALS = 6;
/** Commodity quantities are 18-decimal kilograms on-chain: one token is one kilogram. */
export const KG_DECIMALS = 18;
/** Oracle prices are USD per kilogram with 8 decimals. */
export const PRICE_DECIMALS = 8;
/** Percentages on-chain are basis points. */
export const BPS = 10_000n;
/** Interest rates on-chain are annual, 1e18-scaled. */
export const WAD = 10n ** 18n;
