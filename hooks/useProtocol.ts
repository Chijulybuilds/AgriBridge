import { useCallback, useMemo } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits, maxUint256, type Address } from "viem";

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
 */
export function useTx() {
  const { writeContractAsync, data: hash, isPending, error, reset } = useWriteContract();
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

  return {
    write: writeContractAsync,
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

  const { data, isLoading, refetch } = useReadContracts({
    contracts: pool
      ? [
          { address: pool, abi: LendingPoolAbi, functionName: "totalAssets" },
          { address: pool, abi: LendingPoolAbi, functionName: "totalBorrowed" },
          { address: pool, abi: LendingPoolAbi, functionName: "getBorrowRate" },
          { address: pool, abi: LendingPoolAbi, functionName: "reserveFactor" },
        ]
      : [],
    query: { enabled: Boolean(pool) },
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
    query: { enabled: Boolean(address && pool && shareToken && usdc) },
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
      tx.write({
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
      tx.write({
        address: requireContract("lendingPool"),
        abi: LendingPoolAbi,
        functionName: "deposit",
        args: [amount],
      }),
    [tx],
  );

  const withdraw = useCallback(
    (shares: bigint) =>
      tx.write({
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
    query: { enabled: Boolean(address && registry) },
  });

  const commodityIds = (ids as bigint[] | undefined) ?? [];

  const { data: records, isLoading: recordsLoading, refetch: refetchRecords } = useReadContracts({
    contracts: registry
      ? commodityIds.map((id) => ({
          address: registry,
          abi: CommodityRegistryAbi,
          functionName: "getCommodity" as const,
          args: [id] as const,
        }))
      : [],
    query: { enabled: commodityIds.length > 0 },
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

        return {
          id: commodityIds[index],
          farmer: value.farmer,
          status: statusFromIndex(Number(value.status)),
          commodityType: ["Cocoa", "Rice", "Maize", "Cashew", "Yam"][Number(value.commodityType)] ?? "Cocoa",
          grade: ["A", "B", "C"][Number(value.grade)] ?? "A",
          quantity: value.quantity,
          harvestDate: Number(value.harvestDate),
          storageEndDate: Number(value.storageEndDate),
        } satisfies OnChainCommodity;
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
      tx.write({
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
    query: { enabled: Boolean(contracts.priceOracle && commodityId !== undefined && quantity !== undefined) },
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
    query: { enabled: Boolean(address && pool) },
  });

  const loanIds = (ids as bigint[] | undefined) ?? [];

  const { data, isLoading, refetch: refetchDetails } = useReadContracts({
    contracts: pool
      ? loanIds.flatMap((id) => [
          { address: pool, abi: LendingPoolAbi, functionName: "getLoanDetails" as const, args: [id] as const },
          { address: pool, abi: LendingPoolAbi, functionName: "getHealthFactor" as const, args: [id] as const },
        ])
      : [],
    query: { enabled: loanIds.length > 0 },
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

        return {
          id,
          farmer: details[0],
          principal: details[1],
          collateralAmount: details[2],
          status: Number(details[3]),
          totalDebt: details[4],
          healthFactor: health,
        } satisfies Loan;
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
      tx.write({
        address: requireContract("commodityToken"),
        abi: CommodityTokenAbi,
        functionName: "setApprovalForAll",
        args: [requireContract("lendingPool"), true],
      }),
    [tx],
  );

  const borrow = useCallback(
    (commodityId: bigint, collateralAmount: bigint, borrowAmount: bigint) =>
      tx.write({
        address: requireContract("lendingPool"),
        abi: LendingPoolAbi,
        functionName: "borrow",
        args: [commodityId, collateralAmount, borrowAmount],
      }),
    [tx],
  );

  const repay = useCallback(
    (loanId: bigint, amount: bigint) =>
      tx.write({
        address: requireContract("lendingPool"),
        abi: LendingPoolAbi,
        functionName: "repay",
        args: [loanId, amount],
      }),
    [tx],
  );

  const approveUsdc = useCallback(
    (amount: bigint) =>
      tx.write({
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
