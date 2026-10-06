import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address, Hex } from "viem";

import {
  AgriShareTokenAbi,
  CommodityConfigAbi,
  CommodityPriceOracleAbi,
  CommodityRegistryAbi,
  CommodityTokenAbi,
  DemoUSDCAbi,
  ERC20Abi,
  LendingPoolAbi,
  MarketplaceAbi,
  WarehouseDeskAbi,
} from "../lib/contracts/abis";
import {
  BPS,
  contracts,
  GRADES,
  LOAN_STATUSES,
  LOT_STATUSES,
  REQUEST_STATUSES,
  type Grade,
  type LoanStatus,
  type LotStatus,
  type RequestStatus,
} from "../lib/contracts/config";
import { orUndefined, publicClient } from "../lib/chain";

/**
 * Everything the app reads from the contracts, as plain objects in the units the
 * screens use. Records are numbered from 1 on every contract, so each list is
 * read as `1..count`. All reads go through lib/chain.ts, never the wallet.
 */

const REFRESH = 15_000;

function ids(count: bigint | undefined): bigint[] {
  return Array.from({ length: Number(count ?? 0n) }, (_, i) => BigInt(i + 1));
}

/*//////////////////////////////////////////////////////////////
                           COMMODITIES
//////////////////////////////////////////////////////////////*/

export type Commodity = {
  id: bigint;
  name: string;
  active: boolean;
  /** 0: world price (Chainlink in production); 1: local price (reporters). */
  priceSource: number;
  gradeBFactorBps: number;
  gradeCFactorBps: number;
  daysToGradeB: number;
  daysToGradeC: number;
  daysToExpiry: number;
  maxLtvBps: number;
  liquidationLtvBps: number;
  basisBps: number;
  /** USDC (6 decimals) per metric ton per 30 days. */
  storageFeePerTonMonth: bigint;
  /** USD per kg, 8 decimals. */
  price?: bigint;
  priceUpdatedAt?: bigint;
  /** Whether the price is recent enough for loans and the market to use. */
  fresh: boolean;
};

export function useCommodities() {
  const config = contracts.config;
  const oracle = contracts.oracle;
  const query = useQuery({
    queryKey: ["commodities", config, oracle],
    enabled: Boolean(config && oracle),
    refetchInterval: REFRESH,
    queryFn: async (): Promise<Commodity[]> => {
      const count = await publicClient.readContract({
        address: config!,
        abi: CommodityConfigAbi,
        functionName: "commodityCount",
      });
      return Promise.all(
        ids(count).map(async (id) => {
          const [row, price, fresh] = await Promise.all([
            publicClient.readContract({ address: config!, abi: CommodityConfigAbi, functionName: "getCommodity", args: [id] }),
            orUndefined(publicClient.readContract({ address: oracle!, abi: CommodityPriceOracleAbi, functionName: "getPrice", args: [id] })),
            orUndefined(publicClient.readContract({ address: oracle!, abi: CommodityPriceOracleAbi, functionName: "isFresh", args: [id] })),
          ]);
          return {
            id,
            ...row,
            price: price?.[0],
            priceUpdatedAt: price?.[1],
            fresh: fresh === true,
          };
        }),
      );
    },
  });
  const byId = useMemo(() => new Map((query.data ?? []).map((c) => [c.id, c])), [query.data]);
  return { commodities: query.data ?? [], byId, isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

/*//////////////////////////////////////////////////////////////
                           WAREHOUSES
//////////////////////////////////////////////////////////////*/

export type Warehouse = {
  id: bigint;
  name: string;
  region: string;
  capacityKg: bigint;
  storedKg: bigint;
  active: boolean;
  frozen: boolean;
};

export function useWarehouses() {
  const registry = contracts.registry;
  const query = useQuery({
    queryKey: ["warehouses", registry],
    enabled: Boolean(registry),
    refetchInterval: REFRESH,
    queryFn: async (): Promise<Warehouse[]> => {
      const count = await publicClient.readContract({ address: registry!, abi: CommodityRegistryAbi, functionName: "warehouseCount" });
      return Promise.all(
        ids(count).map(async (id) => ({
          id,
          ...(await publicClient.readContract({
            address: registry!,
            abi: CommodityRegistryAbi,
            functionName: "getWarehouse",
            args: [id],
          })),
        })),
      );
    },
  });
  const byId = useMemo(() => new Map((query.data ?? []).map((w) => [w.id, w])), [query.data]);
  return { warehouses: query.data ?? [], byId, isLoading: query.isLoading, error: query.error };
}

/*//////////////////////////////////////////////////////////////
                              LOTS
//////////////////////////////////////////////////////////////*/

export type Lot = {
  id: bigint;
  farmer: Address;
  status: LotStatus;
  /** Grade the Safe gave at intake. */
  intakeGrade: Grade;
  frozen: boolean;
  commodityId: bigint;
  warehouseId: bigint;
  estimatedKg: bigint;
  measuredKg: bigint;
  harvestDate: bigint;
  requestedAt: bigint;
  verifiedAt: bigint;
  evidenceHash: Hex;
  rejectionReason: Hex;
  /** Verified lots only: grade today, which falls as the crop ages. */
  currentGrade?: Grade;
  expiresAt?: bigint;
  expired: boolean;
  /** Verified, not frozen, not expired: can be borrowed against or listed. */
  usable: boolean;
  /** Share of Grade A value left today, in basis points. */
  valueFactorBps?: bigint;
  /** What a lender or buyer counts: decay less the commodity's basis cut, in basis points. */
  valuationFactorBps?: bigint;
  /** Kilograms of this lot still in existence (not yet collected from the warehouse). */
  supplyKg?: bigint;
  /** Kilograms the connected account holds. */
  balanceKg: bigint;
};

/** Every lot on the registry, with the connected account's holdings. */
export function useLots(account?: Address) {
  const registry = contracts.registry;
  const token = contracts.token;
  const query = useQuery({
    queryKey: ["lots", registry, token, account],
    enabled: Boolean(registry && token),
    refetchInterval: REFRESH,
    queryFn: async (): Promise<Lot[]> => {
      const count = await publicClient.readContract({ address: registry!, abi: CommodityRegistryAbi, functionName: "lotCount" });
      const now = BigInt(Math.floor(Date.now() / 1000));
      return Promise.all(
        ids(count).map(async (id): Promise<Lot> => {
          const raw = await publicClient.readContract({ address: registry!, abi: CommodityRegistryAbi, functionName: "getLot", args: [id] });
          const status = LOT_STATUSES[raw.status] ?? "Pending";
          const base = {
            id,
            farmer: raw.farmer,
            status,
            intakeGrade: GRADES[raw.grade] ?? "A",
            frozen: raw.frozen,
            commodityId: BigInt(raw.commodityId),
            warehouseId: BigInt(raw.warehouseId),
            estimatedKg: raw.estimatedKg,
            measuredKg: raw.measuredKg,
            harvestDate: raw.harvestDate,
            requestedAt: raw.requestedAt,
            verifiedAt: raw.verifiedAt,
            evidenceHash: raw.evidenceHash,
            rejectionReason: raw.rejectionReason,
          };
          const balanceKg = account
            ? await publicClient.readContract({ address: token!, abi: CommodityTokenAbi, functionName: "balanceOf", args: [account, id] })
            : 0n;
          if (status !== "Verified") return { ...base, expired: false, usable: false, balanceKg };

          const [currentGrade, expiresAt, expired, usable, valueFactorBps, valuationFactorBps, supplyKg] = await Promise.all([
            publicClient.readContract({ address: registry!, abi: CommodityRegistryAbi, functionName: "currentGrade", args: [id] }),
            publicClient.readContract({ address: registry!, abi: CommodityRegistryAbi, functionName: "expiresAt", args: [id] }),
            publicClient.readContract({ address: registry!, abi: CommodityRegistryAbi, functionName: "isExpired", args: [id] }),
            publicClient.readContract({ address: registry!, abi: CommodityRegistryAbi, functionName: "isUsable", args: [id] }),
            publicClient.readContract({ address: registry!, abi: CommodityRegistryAbi, functionName: "valueFactorAt", args: [id, now] }),
            publicClient.readContract({ address: registry!, abi: CommodityRegistryAbi, functionName: "valuationFactorBps", args: [id, now] }),
            publicClient.readContract({ address: token!, abi: CommodityTokenAbi, functionName: "totalSupply", args: [id] }),
          ]);
          return {
            ...base,
            currentGrade: GRADES[currentGrade] ?? "A",
            expiresAt,
            expired,
            usable,
            valueFactorBps,
            valuationFactorBps,
            supplyKg,
            balanceKg,
          };
        }),
      );
    },
  });
  return { lots: query.data ?? [], isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

/**
 * USDC (6 decimals) one kilogram of a lot is worth today: the commodity's price
 * times the lot's decay, less the basis cut. This is the "reference" value the
 * pool lends against and the market prices "follow the market" listings from.
 */
export function referenceValuePerKg(lot: Lot, commodity: Commodity | undefined): bigint | undefined {
  if (!commodity?.price || lot.valuationFactorBps === undefined) return undefined;
  return (commodity.price * lot.valuationFactorBps) / 1_000_000n;
}

/** Value of `kg` of a lot today, USDC (6 decimals). */
export function lotValue(lot: Lot, commodity: Commodity | undefined, kgAmount: bigint): bigint | undefined {
  const perKg = referenceValuePerKg(lot, commodity);
  return perKg === undefined ? undefined : (perKg * kgAmount) / 10n ** 18n;
}

/** Share of today's value a lot keeps at future dates, for its value timeline. */
export function useLotTimeline(lotId: bigint | undefined, points: number[]) {
  const registry = contracts.registry;
  return useQuery({
    queryKey: ["lot-timeline", registry, lotId?.toString(), points.join(",")],
    enabled: Boolean(registry && lotId && points.length),
    staleTime: 60_000,
    queryFn: () =>
      Promise.all(
        points.map((t) =>
          publicClient.readContract({
            address: registry!,
            abi: CommodityRegistryAbi,
            functionName: "valuationFactorBps",
            args: [lotId!, BigInt(t)],
          }),
        ),
      ),
  });
}

/*//////////////////////////////////////////////////////////////
                         POOL AND LOANS
//////////////////////////////////////////////////////////////*/

export type PoolStats = {
  totalAssets: bigint;
  availableCash: bigint;
  totalDebt: bigint;
  reserves: bigint;
  /** WAD (1e18 = 100%). */
  utilization: bigint;
  borrowRate: bigint;
  supplyRate: bigint;
  reserveFactor: bigint;
  totalShares: bigint;
};

export function usePoolStats() {
  const pool = contracts.pool;
  const shareToken = contracts.shareToken;
  const query = useQuery({
    queryKey: ["pool", pool, shareToken],
    enabled: Boolean(pool && shareToken),
    refetchInterval: REFRESH,
    queryFn: async (): Promise<PoolStats> => {
      const read = <F extends "totalAssets" | "availableCash" | "totalDebt" | "reserves" | "utilization" | "getBorrowRate" | "getSupplyRate" | "reserveFactor">(
        functionName: F,
      ) => publicClient.readContract({ address: pool!, abi: LendingPoolAbi, functionName });
      const [totalAssets, availableCash, totalDebt, reserves, utilization, borrowRate, supplyRate, reserveFactor, totalShares] =
        await Promise.all([
          read("totalAssets"),
          read("availableCash"),
          read("totalDebt"),
          read("reserves"),
          read("utilization"),
          read("getBorrowRate"),
          read("getSupplyRate"),
          read("reserveFactor"),
          publicClient.readContract({ address: shareToken!, abi: AgriShareTokenAbi, functionName: "totalSupply" }),
        ]);
      return { totalAssets, availableCash, totalDebt, reserves, utilization, borrowRate, supplyRate, reserveFactor, totalShares };
    },
  });
  return { stats: query.data, isLoading: query.isLoading, error: query.error };
}

/** The connected investor's position: pool shares and what they are worth now. */
export function useInvestorPosition(account?: Address) {
  const pool = contracts.pool;
  const shareToken = contracts.shareToken;
  const query = useQuery({
    queryKey: ["position", pool, shareToken, account],
    enabled: Boolean(pool && shareToken && account),
    refetchInterval: REFRESH,
    queryFn: async () => {
      const shares = await publicClient.readContract({
        address: shareToken!,
        abi: AgriShareTokenAbi,
        functionName: "balanceOf",
        args: [account!],
      });
      const value = await publicClient.readContract({ address: pool!, abi: LendingPoolAbi, functionName: "convertToAssets", args: [shares] });
      return { shares, value };
    },
  });
  return { position: query.data, isLoading: query.isLoading };
}

export type Loan = {
  id: bigint;
  borrower: Address;
  openedAt: bigint;
  maturity: bigint;
  status: LoanStatus;
  lotId: bigint;
  collateralKg: bigint;
  principal: bigint;
  /** Owed now, interest included (USDC, 6 decimals). */
  debt: bigint;
  /** WAD: 1e18 means exactly at the liquidation line. Undefined while the price is stale. */
  healthFactor?: bigint;
  /** USD per kg (8 decimals) at which the loan reaches the liquidation line today. */
  liquidationPrice?: bigint;
  liquidatable?: boolean;
};

/** Loans of one borrower, or every active loan when `borrower` is "all-active". */
export function useLoans(borrower: Address | "all-active" | undefined) {
  const pool = contracts.pool;
  const query = useQuery({
    queryKey: ["loans", pool, borrower],
    enabled: Boolean(pool && borrower),
    refetchInterval: REFRESH,
    queryFn: async (): Promise<Loan[]> => {
      const loanIds =
        borrower === "all-active"
          ? await publicClient.readContract({ address: pool!, abi: LendingPoolAbi, functionName: "activeLoanIds" })
          : await publicClient.readContract({ address: pool!, abi: LendingPoolAbi, functionName: "getBorrowerLoans", args: [borrower!] });
      const loans = await Promise.all(
        [...loanIds].map(async (id): Promise<Loan> => {
          const [loan, debt, healthFactor, liquidationPrice, liquidatable] = await Promise.all([
            publicClient.readContract({ address: pool!, abi: LendingPoolAbi, functionName: "getLoan", args: [id] }),
            publicClient.readContract({ address: pool!, abi: LendingPoolAbi, functionName: "debtOf", args: [id] }),
            orUndefined(publicClient.readContract({ address: pool!, abi: LendingPoolAbi, functionName: "getHealthFactor", args: [id] })),
            orUndefined(publicClient.readContract({ address: pool!, abi: LendingPoolAbi, functionName: "liquidationPrice", args: [id] })),
            orUndefined(publicClient.readContract({ address: pool!, abi: LendingPoolAbi, functionName: "isLiquidatable", args: [id] })),
          ]);
          return {
            id,
            borrower: loan.borrower,
            openedAt: loan.openedAt,
            maturity: loan.maturity,
            status: LOAN_STATUSES[loan.status] ?? "Active",
            lotId: loan.lotId,
            collateralKg: loan.collateralKg,
            principal: loan.principal,
            debt,
            healthFactor,
            liquidationPrice,
            liquidatable,
          };
        }),
      );
      return loans.sort((a, b) => Number(b.id - a.id));
    },
  });
  return { loans: query.data ?? [], isLoading: query.isLoading, error: query.error };
}

/** The most a lot can borrow against `kg` until `maturity` (USDC, 6 decimals). */
export function useMaxBorrow(lotId: bigint | undefined, kgAmount: bigint | undefined, maturity: number | undefined) {
  const pool = contracts.pool;
  return useQuery({
    queryKey: ["max-borrow", pool, lotId?.toString(), kgAmount?.toString(), maturity],
    enabled: Boolean(pool && lotId && kgAmount && maturity),
    queryFn: () =>
      publicClient.readContract({
        address: pool!,
        abi: LendingPoolAbi,
        functionName: "maxBorrow",
        args: [lotId!, kgAmount!, BigInt(maturity!)],
      }),
  });
}

/*//////////////////////////////////////////////////////////////
                            MARKET
//////////////////////////////////////////////////////////////*/

export type Listing = {
  id: bigint;
  seller: Address;
  /** 0: fixed USDC per kg; 1: percentage (bps) of the reference value. */
  mode: number;
  clearance: boolean;
  active: boolean;
  lotId: bigint;
  kgRemaining: bigint;
  price: bigint;
  bulkMinKg: bigint;
  bulkDiscountBps: bigint;
  /** Asking price now, USDC (6 decimals) per kg. Undefined while a "follow the market" price is stale. */
  pricePerKg?: bigint;
};

export function useListings() {
  const marketplace = contracts.marketplace;
  const query = useQuery({
    queryKey: ["listings", marketplace],
    enabled: Boolean(marketplace),
    refetchInterval: REFRESH,
    queryFn: async (): Promise<Listing[]> => {
      const count = await publicClient.readContract({ address: marketplace!, abi: MarketplaceAbi, functionName: "listingCount" });
      const listings = await Promise.all(
        ids(count).map(async (id) => {
          const listing = await publicClient.readContract({ address: marketplace!, abi: MarketplaceAbi, functionName: "getListing", args: [id] });
          const pricePerKg = listing.active
            ? await orUndefined(publicClient.readContract({ address: marketplace!, abi: MarketplaceAbi, functionName: "pricePerKg", args: [id] }))
            : undefined;
          return { id, ...listing, pricePerKg };
        }),
      );
      return listings.sort((a, b) => Number(b.id - a.id));
    },
  });
  return { listings: query.data ?? [], isLoading: query.isLoading, error: query.error };
}

export type MarketSettings = {
  feeBps: bigint;
  clearanceDiscountBps: bigint;
  clearanceFund: bigint;
  maxBulkDiscountBps: bigint;
  maxReferenceBps: bigint;
};

export function useMarketSettings() {
  const marketplace = contracts.marketplace;
  const query = useQuery({
    queryKey: ["market-settings", marketplace],
    enabled: Boolean(marketplace),
    refetchInterval: REFRESH,
    queryFn: async (): Promise<MarketSettings> => {
      const read = <F extends "feeBps" | "clearanceDiscountBps" | "clearanceFund" | "MAX_BULK_DISCOUNT_BPS" | "MAX_REFERENCE_BPS">(functionName: F) =>
        publicClient.readContract({ address: marketplace!, abi: MarketplaceAbi, functionName });
      const [feeBps, clearanceDiscountBps, clearanceFund, maxBulkDiscountBps, maxReferenceBps] = await Promise.all([
        read("feeBps"),
        read("clearanceDiscountBps"),
        read("clearanceFund"),
        read("MAX_BULK_DISCOUNT_BPS"),
        read("MAX_REFERENCE_BPS"),
      ]);
      return { feeBps, clearanceDiscountBps, clearanceFund, maxBulkDiscountBps, maxReferenceBps };
    },
  });
  return { settings: query.data };
}

/** What `kg` from a listing costs right now, after any bulk deal (USDC, 6 decimals). */
export function useQuote(listingId: bigint | undefined, kgAmount: bigint | undefined) {
  const marketplace = contracts.marketplace;
  return useQuery({
    queryKey: ["quote", marketplace, listingId?.toString(), kgAmount?.toString()],
    enabled: Boolean(marketplace && listingId && kgAmount),
    refetchInterval: REFRESH,
    queryFn: () =>
      publicClient.readContract({ address: marketplace!, abi: MarketplaceAbi, functionName: "quote", args: [listingId!, kgAmount!] }),
  });
}

/** What AgriBridge pays now for `kg` of an expired lot (USDC, 6 decimals). */
export function useClearanceQuote(lotId: bigint | undefined, kgAmount: bigint | undefined) {
  const marketplace = contracts.marketplace;
  return useQuery({
    queryKey: ["clearance-quote", marketplace, lotId?.toString(), kgAmount?.toString()],
    enabled: Boolean(marketplace && lotId && kgAmount),
    queryFn: () =>
      publicClient.readContract({
        address: marketplace!,
        abi: MarketplaceAbi,
        functionName: "clearanceQuote",
        args: [lotId!, kgAmount!],
      }),
  });
}

/** Kilograms of each lot the protocol bought through clearance and has not listed yet. */
export function useClearanceInventory(lotIds: bigint[]) {
  const marketplace = contracts.marketplace;
  return useQuery({
    queryKey: ["clearance-inventory", marketplace, lotIds.join(",")],
    enabled: Boolean(marketplace && lotIds.length),
    refetchInterval: REFRESH,
    queryFn: async () => {
      const amounts = await Promise.all(
        lotIds.map((id) =>
          publicClient.readContract({ address: marketplace!, abi: MarketplaceAbi, functionName: "clearanceInventory", args: [id] }),
        ),
      );
      return new Map(lotIds.map((id, i) => [id, amounts[i]]));
    },
  });
}

/*//////////////////////////////////////////////////////////////
                    COLLECTING FROM THE WAREHOUSE
//////////////////////////////////////////////////////////////*/

export type WithdrawalRequest = {
  id: bigint;
  holder: Address;
  status: RequestStatus;
  requestedAt: bigint;
  lotId: bigint;
  kg: bigint;
  storageFee: bigint;
  /** Zero for pickup; otherwise the most the holder agreed to pay for delivery. */
  deliveryBudget: bigint;
};

export function useWithdrawalRequests(holder?: Address) {
  const desk = contracts.desk;
  const query = useQuery({
    queryKey: ["withdrawals", desk, holder],
    enabled: Boolean(desk),
    refetchInterval: REFRESH,
    queryFn: async (): Promise<WithdrawalRequest[]> => {
      const count = await publicClient.readContract({ address: desk!, abi: WarehouseDeskAbi, functionName: "requestCount" });
      const requests = await Promise.all(
        ids(count).map(async (id) => {
          const request = await publicClient.readContract({ address: desk!, abi: WarehouseDeskAbi, functionName: "getRequest", args: [id] });
          return { id, ...request, status: REQUEST_STATUSES[request.status] ?? "Pending" };
        }),
      );
      return requests
        .filter((r) => !holder || r.holder.toLowerCase() === holder.toLowerCase())
        .sort((a, b) => Number(b.id - a.id));
    },
  });
  return { requests: query.data ?? [], isLoading: query.isLoading };
}

/** Storage owed on `kg` of a lot if it were collected now (USDC, 6 decimals). */
export function useStorageFee(lotId: bigint | undefined, kgAmount: bigint | undefined) {
  const desk = contracts.desk;
  return useQuery({
    queryKey: ["storage-fee", desk, lotId?.toString(), kgAmount?.toString()],
    enabled: Boolean(desk && lotId && kgAmount),
    refetchInterval: REFRESH,
    queryFn: () =>
      publicClient.readContract({ address: desk!, abi: WarehouseDeskAbi, functionName: "storageFeeOf", args: [lotId!, kgAmount!] }),
  });
}

/*//////////////////////////////////////////////////////////////
                         MONEY AND ROLES
//////////////////////////////////////////////////////////////*/

/** The account's USDC balance, and whether this deployment's USDC hands out test dollars. */
export function useUsdc(account?: Address) {
  const usdc = contracts.usdc;
  const balance = useQuery({
    queryKey: ["usdc-balance", usdc, account],
    enabled: Boolean(usdc && account),
    refetchInterval: REFRESH,
    queryFn: () => publicClient.readContract({ address: usdc!, abi: ERC20Abi, functionName: "balanceOf", args: [account!] }),
  });
  // Only the demo's play-money USDC has a faucet; real USDC fails this read.
  const faucet = useQuery({
    queryKey: ["usdc-faucet", usdc],
    enabled: Boolean(usdc),
    staleTime: Infinity,
    retry: false,
    queryFn: () => publicClient.readContract({ address: usdc!, abi: DemoUSDCAbi, functionName: "FAUCET_LIMIT" }),
  });
  return { balance: balance.data, hasFaucet: faucet.data !== undefined };
}

/** Whether `account` holds `role` on the registry (e.g. the regulator role). */
export function useHasRegistryRole(role: Hex, account?: Address) {
  const registry = contracts.registry;
  const query = useQuery({
    queryKey: ["registry-role", registry, role, account],
    enabled: Boolean(registry && account),
    queryFn: () =>
      publicClient.readContract({ address: registry!, abi: CommodityRegistryAbi, functionName: "hasRole", args: [role, account!] }),
  });
  return { hasRole: query.data === true, isLoading: query.isLoading };
}

/** Basis points as a fraction of BPS, for quick maths on the screens. */
export function bpsOf(value: bigint, bps: bigint | number): bigint {
  return (value * BigInt(bps)) / BPS;
}
