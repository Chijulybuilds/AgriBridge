import { useCallback, useMemo } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useWalletClient } from "wagmi";
import { formatUnits, parseUnits, maxUint256, type Address } from "viem";
import { waitForTransactionReceipt } from "viem/actions";

import {
  CommodityRegistryAbi,
  CommodityTokenAbi,
  CommodityPriceOracleAbi,
  AgriShareTokenAbi,
  LendingPoolAbi,
  ERC20Abi,
} from "../lib/contracts/abis";
import {
  contracts,
  requireContract,
  commodityTypeToIndex,
  gradeToIndex,
  statusFromIndex,
  USDC_DECIMALS,
  QUANTITY_DECIMALS,
  PRICE_DECIMALS,
  type CommodityType,
  type Grade,
} from "../lib/contracts/config";

/*//////////////////////////////////////////////////////////////
                            FORMATTING
//////////////////////////////////////////////////////////////*/

export function formatUsdc(value: bigint | undefined, fractionDigits = 2): string {
  if (value === undefined) return "—";
  return Number(formatUnits(value, USDC_DECIMALS)).toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatKg(value: bigint | undefined): string {
  if (value === undefined) return "—";
  return Number(formatUnits(value, QUANTITY_DECIMALS)).toLocaleString();
}

export function formatPrice(value: bigint | undefined): string {
  if (value === undefined) return "—";
  return Number(formatUnits(value, PRICE_DECIMALS)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const toUsdc = (amount: string | number) => parseUnits(String(amount), USDC_DECIMALS);
export const toQuantity = (kg: string | number) => parseUnits(String(kg), QUANTITY_DECIMALS);

/*//////////////////////////////////////////////////////////////
                          TRANSACTIONS
//////////////////////////////////////////////////////////////*/

/**
 * Wraps a contract write with its receipt, so callers get one object covering
 * the whole lifecycle: submitting, waiting for confirmation, confirmed, failed.
 *
 * TWO write functions are returned:
 * - `write` — raw wagmi write (resolves after wallet signs, before tx mined)
 * - `writeAndWait` — enhanced version that AWAITS the on-chain receipt before resolving
 *
 * Use `writeAndWait` in pages where you want to show data AFTER the tx confirms.
 */
export function useTx() {
  const { writeContractAsync, data: hash, isPending, error, reset } = useWriteContract();
  const publicClient = usePublicClient();
  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  const status = isPending
    ? "signing"
    : isConfirming
      ? "confirming"
      : isConfirmed
        ? "confirmed"
        : error || receiptError
          ? "failed"
          : "idle";

  /**
   * Submits a contract write and waits for the on-chain receipt.
   * The caller's `await` resolves only when the transaction is MINED.
   */
  const writeAndWait = useCallback(
    async (
      args: Parameters<typeof writeContractAsync>[0],
    ): Promise<`0x${string}`> => {
      const txHash = await writeContractAsync(args);
      if (publicClient) {
        await waitForTransactionReceipt(publicClient, { hash: txHash });
      }
      return txHash;
    },
    [writeContractAsync, publicClient],
  );

  return {
    write: writeContractAsync,
    writeAndWait,
    hash,
    status,
    isBusy: isPending || isConfirming,
    isConfirmed,
    error: error ?? receiptError ?? null,
    reset,
  };
}

/*//////////////////////////////////////////////////////////////
                        POOL / INVESTOR READS
//////////////////////////////////////////////////////////////*/

/** Live pool statistics: size, borrowed, utilisation and current borrow rate. */
export function usePoolStats() {
  const pool = contracts.lendingPool;

  const { data, isLoading, error, refetch } = useReadContracts({
    contracts: pool
      ? [
        { address: pool, abi: LendingPoolAbi, functionName: "totalAssets" },
        { address: pool, abi: LendingPoolAbi, functionName: "totalBorrowed" },
        { address: pool, abi: LendingPoolAbi, functionName: "getBorrowRate" },
        { address: pool, abi: LendingPoolAbi, functionName: "reserveFactor" },
      ]
      : [],
    query: { enabled: Boolean(pool), refetchInterval: 10_000 },
  });

  const totalAssets = data?.[0]?.result as bigint | undefined;
  const totalBorrowed = data?.[1]?.result as bigint | undefined;
  const borrowRate = data?.[2]?.result as bigint | undefined;
  const reserveFactor = data?.[3]?.result as bigint | undefined;

  const utilisation =
    totalAssets && totalAssets > 0n && totalBorrowed !== undefined
      ? Number((totalBorrowed * 10_000n) / totalAssets) / 100
      : 0;

  // Borrow rate is 1e18-scaled and annualised.
  const borrowApr = borrowRate !== undefined ? Number(formatUnits(borrowRate, 18)) * 100 : undefined;

  // Lenders receive the borrow interest net of the protocol reserve cut,
  // shared across the whole pool rather than only the borrowed portion.
  const supplyApr =
    borrowApr !== undefined && reserveFactor !== undefined
      ? borrowApr * (utilisation / 100) * (1 - Number(formatUnits(reserveFactor, 18)))
      : undefined;

  return {
    totalAssets,
    totalBorrowed,
    availableLiquidity:
      totalAssets !== undefined && totalBorrowed !== undefined ? totalAssets - totalBorrowed : undefined,
    utilisation,
    borrowApr,
    supplyApr,
    isLoading,
    error,
    refetch,
  };
}

export type PendingCommodity = {
  id: string;
  on_chain_id: number;
  farmer_wallet: Address;
  commodity_type: string;
  grade: string;
  quantity_kg: number;
  harvest_date: string;
  status: string;
};

/** Pending submissions read directly from the registry's one-based IDs. */
export function usePendingCommodities() {
  const registry = contracts.registry;
  const {
    data: count,
    isLoading: isCountLoading,
    error: countError,
    refetch: refetchCount,
  } = useReadContract({
    address: registry,
    abi: CommodityRegistryAbi,
    functionName: "commodityCount",
    query: { enabled: Boolean(registry), refetchInterval: 10_000 },
  });

  const commodityIds = useMemo(
    () => Array.from({ length: Number((count as bigint | undefined) ?? 0n) }, (_, index) => BigInt(index + 1)),
    [count],
  );

  const {
    data: records,
    isLoading: areRecordsLoading,
    error: recordsError,
    refetch: refetchRecords,
  } = useReadContracts({
    contracts: registry
      ? commodityIds.map((id) => ({
        address: registry,
        abi: CommodityRegistryAbi,
        functionName: "getCommodity" as const,
        args: [id] as const,
      }))
      : [],
    query: {
      enabled: Boolean(registry && commodityIds.length > 0),
      refetchInterval: 10_000,
    },
  });

  const commodities = useMemo(() => {
    if (!records) return [];
    return records.flatMap((entry, index) => {
      const value = entry.result as
        | {
          farmer: Address;
          status: number;
          commodityType: number;
          grade: number;
          quantity: bigint;
          harvestDate: bigint;
        }
        | undefined;
      if (!value || Number(value.status) !== 0) return [];
      const id = commodityIds[index];
      return [{
        id: id.toString(),
        on_chain_id: Number(id),
        farmer_wallet: value.farmer,
        commodity_type: ["Cocoa", "Rice", "Maize", "Cashew", "Yam"][Number(value.commodityType)] ?? "Cocoa",
        grade: ["A", "B", "C"][Number(value.grade)] ?? "A",
        quantity_kg: Number(formatUnits(value.quantity, QUANTITY_DECIMALS)),
        harvest_date: new Date(Number(value.harvestDate) * 1000).toISOString().slice(0, 10),
        status: statusFromIndex(Number(value.status)),
      } satisfies PendingCommodity];
    });
  }, [records, commodityIds]);

  const refetch = useCallback(async () => {
    await refetchCount();
    await refetchRecords();
  }, [refetchCount, refetchRecords]);

  return {
    commodities,
    isLoading: isCountLoading || areRecordsLoading,
    error: countError ?? recordsError,
    refetch,
  };
}

/** The connected investor's agUSDC position and its USDC value. */
export function useInvestorPosition() {
  const { address } = useAccount();
  const pool = contracts.lendingPool;
  const shareToken = contracts.shareToken;
  const usdc = contracts.usdc;

  const { data, isLoading, refetch } = useReadContracts({
    contracts:
      address && pool && shareToken && usdc
        ? [
          { address: shareToken, abi: AgriShareTokenAbi, functionName: "balanceOf", args: [address] },
          { address: shareToken, abi: AgriShareTokenAbi, functionName: "totalSupply" },
          { address: pool, abi: LendingPoolAbi, functionName: "totalAssets" },
          { address: usdc, abi: ERC20Abi, functionName: "balanceOf", args: [address] },
          { address: usdc, abi: ERC20Abi, functionName: "allowance", args: [address, pool] },
        ]
        : [],
    query: { enabled: Boolean(address && pool && shareToken && usdc), refetchInterval: 10_000 },
  });

  const shares = data?.[0]?.result as bigint | undefined;
  const totalShares = data?.[1]?.result as bigint | undefined;
  const totalAssets = data?.[2]?.result as bigint | undefined;
  const usdcBalance = data?.[3]?.result as bigint | undefined;
  const allowance = data?.[4]?.result as bigint | undefined;

  // Share price drifts above 1:1 as interest accrues, so value is derived
  // rather than assumed equal to the share count.
  const positionValue =
    shares !== undefined && totalShares !== undefined && totalAssets !== undefined && totalShares > 0n
      ? (shares * totalAssets) / totalShares
      : shares;

  const earnings =
    positionValue !== undefined && shares !== undefined && positionValue > shares
      ? positionValue - shares
      : 0n;

  return { shares, positionValue, earnings, usdcBalance, allowance, isLoading, refetch };
}

/*//////////////////////////////////////////////////////////////
                        INVESTOR WRITES
//////////////////////////////////////////////////////////////*/

export function useDeposit() {
  const tx = useTx();

  const approve = useCallback(
    (amount: bigint) =>
      tx.writeAndWait({
        address: requireContract("usdc"),
        abi: ERC20Abi,
        functionName: "approve",
        args: [requireContract("lendingPool"), amount],
      }),
    [tx],
  );

  const approveMax = useCallback(() => approve(maxUint256), [approve]);

  const deposit = useCallback(
    (amount: bigint) =>
      tx.writeAndWait({
        address: requireContract("lendingPool"),
        abi: LendingPoolAbi,
        functionName: "deposit",
        args: [amount],
      }),
    [tx],
  );

  const withdraw = useCallback(
    (shares: bigint) =>
      tx.writeAndWait({
        address: requireContract("lendingPool"),
        abi: LendingPoolAbi,
        functionName: "withdraw",
        args: [shares],
      }),
    [tx],
  );

  return { ...tx, approve, approveMax, deposit, withdraw };
}

/*//////////////////////////////////////////////////////////////
                        FARMER: COMMODITIES
//////////////////////////////////////////////////////////////*/

export type OnChainCommodity = {
  id: bigint;
  farmer: Address;
  status: string;
  commodityType: string;
  grade: string;
  quantity: bigint;
  harvestDate: number;
  storageEndDate: number;
  tokenBalance?: bigint;
};

/** Commodity ids the connected farmer owns, with their on-chain records. */
export function useMyCommodities() {
  const { address } = useAccount();
  const registry = contracts.registry;

  const { data: ids, isLoading: idsLoading, refetch: refetchIds } = useReadContract({
    address: registry,
    abi: CommodityRegistryAbi,
    functionName: "getFarmerCommodityIds",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && registry), refetchInterval: 10_000 },
  });

  // Memoised so the fallback empty array keeps a stable identity across renders;
  // otherwise every render produces a new array and defeats the memo below.
  const commodityIds = useMemo(() => (ids as bigint[] | undefined) ?? [], [ids]);

  const { data: records, isLoading: recordsLoading, refetch: refetchRecords } = useReadContracts({
    contracts: registry
      ? commodityIds.map((id) => ({
        address: registry,
        abi: CommodityRegistryAbi,
        functionName: "getCommodity" as const,
        args: [id] as const,
      }))
      : [],
    query: { enabled: commodityIds.length > 0, refetchInterval: 10_000 },
  });

  const commodities: OnChainCommodity[] = useMemo(() => {
    if (!records) return [];
    return records
      .map((entry, index) => {
        const value = entry.result as
          | {
            farmer: Address;
            status: number;
            commodityType: number;
            grade: number;
            quantity: bigint;
            harvestDate: bigint;
            storageEndDate: bigint;
          }
          | undefined;
        if (!value) return null;

        const commodity: OnChainCommodity = {
          id: commodityIds[index],
          farmer: value.farmer,
          status: statusFromIndex(Number(value.status)),
          commodityType: ["Cocoa", "Rice", "Maize", "Cashew", "Yam"][Number(value.commodityType)] ?? "Cocoa",
          grade: ["A", "B", "C"][Number(value.grade)] ?? "A",
          quantity: value.quantity,
          harvestDate: Number(value.harvestDate),
          storageEndDate: Number(value.storageEndDate),
        };
        return commodity;
      })
      .filter((c): c is OnChainCommodity => c !== null);
  }, [records, commodityIds]);

  const refetch = useCallback(async () => {
    await refetchIds();
    await refetchRecords();
  }, [refetchIds, refetchRecords]);

  return { commodities, isLoading: idsLoading || recordsLoading, refetch };
}

/** Registers a commodity on-chain. The farmer signs; there is no backend gate. */
export function useRegisterCommodity() {
  const tx = useTx();

  const register = useCallback(
    (input: {
      commodityType: CommodityType;
      quantityKg: string | number;
      grade: Grade;
      harvestDate: Date;
      storageDurationDays: number;
    }) =>
      tx.writeAndWait({
        address: requireContract("registry"),
        abi: CommodityRegistryAbi,
        functionName: "registerCommodity",
        args: [
          commodityTypeToIndex(input.commodityType),
          toQuantity(input.quantityKg),
          gradeToIndex(input.grade),
          BigInt(Math.floor(input.harvestDate.getTime() / 1000)),
          BigInt(input.storageDurationDays),
        ],
      }),
    [tx],
  );

  return { ...tx, register };
}

/*//////////////////////////////////////////////////////////////
                        FARMER: BORROWING
//////////////////////////////////////////////////////////////*/

/** USD value of a commodity's collateral, straight from the oracle. */
export function useCollateralValue(commodityId: bigint | undefined, quantity: bigint | undefined) {
  const { data, isLoading, error } = useReadContract({
    address: contracts.priceOracle,
    abi: CommodityPriceOracleAbi,
    functionName: "getCollateralValue",
    args: commodityId !== undefined && quantity !== undefined ? [commodityId, quantity] : undefined,
    query: { enabled: Boolean(contracts.priceOracle && commodityId !== undefined && quantity !== undefined), refetchInterval: 10_000 },
  });

  return { value: data as bigint | undefined, isLoading, error };
}

export type Loan = {
  id: bigint;
  farmer: Address;
  principal: bigint;
  collateralAmount: bigint;
  status: number;
  totalDebt: bigint;
  healthFactor?: bigint;
};

/** The connected farmer's loans, with live debt and health factor. */
export function useMyLoans() {
  const { address } = useAccount();
  const pool = contracts.lendingPool;

  const { data: ids, isLoading: idsLoading, refetch: refetchIds } = useReadContract({
    address: pool,
    abi: LendingPoolAbi,
    functionName: "getFarmerLoans",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && pool), refetchInterval: 10_000 },
  });

  // Memoised for the same reason as commodityIds above.
  const loanIds = useMemo(() => (ids as bigint[] | undefined) ?? [], [ids]);

  const { data, isLoading, refetch: refetchDetails } = useReadContracts({
    contracts: pool
      ? loanIds.flatMap((id) => [
        { address: pool, abi: LendingPoolAbi, functionName: "getLoanDetails" as const, args: [id] as const },
        { address: pool, abi: LendingPoolAbi, functionName: "getHealthFactor" as const, args: [id] as const },
      ])
      : [],
    query: { enabled: loanIds.length > 0, refetchInterval: 10_000 },
  });

  const loans: Loan[] = useMemo(() => {
    if (!data) return [];
    return loanIds
      .map((id, index) => {
        const details = data[index * 2]?.result as
          | readonly [Address, bigint, bigint, number, bigint]
          | undefined;
        const health = data[index * 2 + 1]?.result as bigint | undefined;
        if (!details) return null;

        const loan: Loan = {
          id,
          farmer: details[0],
          principal: details[1],
          collateralAmount: details[2],
          status: Number(details[3]),
          totalDebt: details[4],
          healthFactor: health,
        };
        return loan;
      })
      .filter((l): l is Loan => l !== null);
  }, [data, loanIds]);

  const refetch = useCallback(async () => {
    await refetchIds();
    await refetchDetails();
  }, [refetchIds, refetchDetails]);

  return { loans, isLoading: idsLoading || isLoading, refetch };
}

export function useBorrow() {
  const tx = useTx();

  /** The pool takes custody of the ERC-1155, so it needs operator approval first. */
  const approveCollateral = useCallback(
    () =>
      tx.writeAndWait({
        address: requireContract("commodityToken"),
        abi: CommodityTokenAbi,
        functionName: "setApprovalForAll",
        args: [requireContract("lendingPool"), true],
      }),
    [tx],
  );

  const borrow = useCallback(
    (commodityId: bigint, collateralAmount: bigint, borrowAmount: bigint) =>
      tx.writeAndWait({
        address: requireContract("lendingPool"),
        abi: LendingPoolAbi,
        functionName: "borrow",
        args: [commodityId, collateralAmount, borrowAmount],
      }),
    [tx],
  );

  const repay = useCallback(
    (loanId: bigint, amount: bigint) =>
      tx.writeAndWait({
        address: requireContract("lendingPool"),
        abi: LendingPoolAbi,
        functionName: "repay",
        args: [loanId, amount],
      }),
    [tx],
  );

  const approveUsdc = useCallback(
    (amount: bigint) =>
      tx.writeAndWait({
        address: requireContract("usdc"),
        abi: ERC20Abi,
        functionName: "approve",
        args: [requireContract("lendingPool"), amount],
      }),
    [tx],
  );

  return { ...tx, approveCollateral, approveUsdc, borrow, repay };
}

/** Whether the pool is already an approved operator for the farmer's collateral. */
export function useCollateralApproval() {
  const { address } = useAccount();

  const { data, refetch } = useReadContract({
    address: contracts.commodityToken,
    abi: CommodityTokenAbi,
    functionName: "isApprovedForAll",
    args: address && contracts.lendingPool ? [address, contracts.lendingPool] : undefined,
    query: { enabled: Boolean(address && contracts.commodityToken && contracts.lendingPool) },
  });

  return { isApproved: Boolean(data), refetch };
}
