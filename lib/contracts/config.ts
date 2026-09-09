import type { Address } from "viem";

/**
 * Deployed contract addresses, read from the environment so a redeploy is a
 * configuration change rather than a code change. `make deploy-all` prints
 * every value this file expects.
 */
function address(value: string | undefined): Address | undefined {
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) return undefined;
  return value as Address;
}

export const contracts = {
  registry: address(process.env.NEXT_PUBLIC_COMMODITY_REGISTRY_ADDRESS),
  commodityToken: address(process.env.NEXT_PUBLIC_COMMODITY_TOKEN_ADDRESS),
  priceOracle: address(process.env.NEXT_PUBLIC_COMMODITY_PRICE_ORACLE_ADDRESS),
  shareToken: address(process.env.NEXT_PUBLIC_AGRI_SHARE_TOKEN_ADDRESS),
  lendingPool: address(process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS),
  usdc: address(process.env.NEXT_PUBLIC_USDC_ADDRESS),
} as const;

export type ContractName = keyof typeof contracts;

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
        `Set the matching NEXT_PUBLIC_* variable in .env.local — see .env.example.`,
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
                    ON-CHAIN ENUM MAPPINGS
//////////////////////////////////////////////////////////////*/

/**
 * Order must match the Solidity enums in CommodityRegistry.sol. The contracts
 * take uint8 indexes, so a reordering here silently mis-registers commodities.
 */
export const COMMODITY_TYPES = ["Cocoa", "Rice", "Maize", "Cashew", "Yam"] as const;
export type CommodityType = (typeof COMMODITY_TYPES)[number];

export const GRADES = ["A", "B", "C"] as const;
export type Grade = (typeof GRADES)[number];

export const COMMODITY_STATUSES = [
  "Pending",
  "Verified",
  "Rejected",
  "Collateralized",
  "Released",
  "Liquidated",
  "Expired",
] as const;
export type CommodityStatus = (typeof COMMODITY_STATUSES)[number];

export function commodityTypeToIndex(type: CommodityType): number {
  return COMMODITY_TYPES.indexOf(type);
}

export function gradeToIndex(grade: Grade): number {
  return GRADES.indexOf(grade);
}

export function statusFromIndex(index: number): CommodityStatus {
  return COMMODITY_STATUSES[index] ?? "Pending";
}

/*//////////////////////////////////////////////////////////////
                            DECIMALS
//////////////////////////////////////////////////////////////*/

/** USDC and agUSDC both use 6 decimals. */
export const USDC_DECIMALS = 6;

/** Commodity quantities are 18-decimal kilograms on-chain. */
export const QUANTITY_DECIMALS = 18;

/** Oracle prices carry 8 decimals. */
export const PRICE_DECIMALS = 8;

/** Maximum loan-to-value the pool accepts, as a fraction. Mirrors MAX_LTV. */
export const MAX_LTV = 0.7;
