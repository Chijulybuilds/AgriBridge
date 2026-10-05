import { useCallback, useMemo, useState } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useSwitchChain } from "wagmi";
import { formatUnits, parseUnits, maxUint256, type Address } from "viem";
import { waitForTransactionReceipt } from "viem/actions";

import { activeChain } from "../lib/wagmi";
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
  COMMODITY_TYPES,
  USDC_DECIMALS,
  QUANTITY_DECIMALS,
  PRICE_DECIMALS,
  VERIFIER_ROLE,
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
 * Returns a function that puts the wallet on the app's chain before a write.
 *
 * Without it, a wallet left on another network (say mainnet) is asked to send
 * the transaction there, to an address that only holds our contract on Sepolia.
 */
export function useEnsureAppChain() {
  const { chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  return useCallback(async () => {
    if (chainId !== activeChain.id) await switchChainAsync({ chainId: activeChain.id });
  }, [chainId, switchChainAsync]);
}

/**
 * Keeps only what the UI shows from a wallet or contract error.
 *
 * viem errors carry the call's arguments, which are usually bigints. React
 * 19's development-only performance tracks JSON.stringify changed props, so
 * handing such an error to a component crashes dev builds with "Do not know
 * how to serialize a BigInt".
 */
export function toDisplayError(error: Error | null | undefined): Error | null {
  if (!error) return null;
  const display = new Error(error.message);
  display.name = error.name;
  return display;
}

/**
 * Wraps a contract write with its receipt, so callers get one object covering
 * the whole lifecycle: submitting, waiting for confirmation, confirmed, failed.
 *
 * `writeAndWait` switches the wallet to the app's chain if needed, submits the
 * write, and resolves only once the transaction is mined.
 */
export function useTx() {
  const { writeContractAsync, data: hash, isPending, error, reset } = useWriteContract();
  const publicClient = usePublicClient();
  const ensureAppChain = useEnsureAppChain();
  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  // A failed network switch happens before wagmi's write starts, so wagmi never
  // sees it; track it here or the user gets no feedback at all.
  const [switchError, setSwitchError] = useState<Error | null>(null);

  const status = isPending
    ? "signing"
    : isConfirming
      ? "confirming"
      : isConfirmed
        ? "confirmed"
        : switchError || error || receiptError
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
      setSwitchError(null);
      try {
        await ensureAppChain();
      } catch {
        const failure = new Error(`Switch your wallet to ${activeChain.name} to continue.`);
        setSwitchError(failure);
        throw failure;
      }
      // Passing chainId makes viem refuse to send if the wallet is still elsewhere.
      const txHash = await writeContractAsync({ ...args, chainId: activeChain.id });
      if (publicClient) {
        // viem returns the receipt of a reverted transaction rather than
        // throwing, so check it; otherwise a failed tx reads as success.
        const receipt = await waitForTransactionReceipt(publicClient, { hash: txHash });
        if (receipt.status === "reverted") {
          throw new Error(`Transaction ${txHash} reverted on-chain.`);
        }
      }
      return txHash;
    },
    [ensureAppChain, writeContractAsync, publicClient],
  );

  const displayError = useMemo(
    () => toDisplayError(switchError ?? error ?? receiptError),
    [switchError, error, receiptError],
  );

  const resetAll = useCallback(() => {
    setSwitchError(null);
    reset();
  }, [reset]);

  return {
    writeAndWait,
    hash,
    status,
    isBusy: isPending || isConfirming,
    isConfirmed,
    error: displayError,
    reset: resetAll,
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

/**
 * Whether a wallet holds VERIFIER_ROLE on the registry. This is the permission
 * approveCommodity and rejectCommodity actually check, so the verifier queue
 * gates on it rather than on the client-side session.
 */
export function useIsVerifier(wallet: Address | undefined) {
  const registry = contracts.registry;
  const { data, isLoading } = useReadContract({
    address: registry,
    abi: CommodityRegistryAbi,
    functionName: "hasRole",
    args: wallet ? [VERIFIER_ROLE, wallet] : undefined,
    query: { enabled: Boolean(registry && wallet) },
  });

  return { isVerifier: data === true, isLoading };
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

/*//////////////////////////////////////////////////////////////
                    VERIFIER: PRICES AND LIQUIDATION
//////////////////////////////////////////////////////////////*/

/** Whether the connected wallet holds `role` on the oracle or the pool (both OpenZeppelin AccessControl). */
export function useHasRole(target: "priceOracle" | "lendingPool", role: `0x${string}`) {
  const { address } = useAccount();
  const contract = contracts[target];
  const { data, isLoading } = useReadContract({
    address: contract,
    abi: target === "priceOracle" ? CommodityPriceOracleAbi : LendingPoolAbi,
    functionName: "hasRole",
    args: address ? [role, address] : undefined,
    query: { enabled: Boolean(contract && address) },
  });
  return { hasRole: data === true, isLoading };
}

export type CommodityPrice = {
  name: CommodityType;
  index: number;
  price?: bigint;
  updatedAt?: number;
  fresh?: boolean;
};

/** Every commodity's oracle price, when it was set, and whether it is still within the heartbeat. */
export function useCommodityPrices() {
  const oracle = contracts.priceOracle;
  const { data, isLoading, refetch } = useReadContracts({
    contracts: oracle
      ? COMMODITY_TYPES.flatMap((_, index) => [
        { address: oracle, abi: CommodityPriceOracleAbi, functionName: "getPrice" as const, args: [index] as const },
        { address: oracle, abi: CommodityPriceOracleAbi, functionName: "isFresh" as const, args: [index] as const },
      ])
      : [],
    query: { enabled: Boolean(oracle), refetchInterval: 10_000 },
  });

  const prices: CommodityPrice[] = COMMODITY_TYPES.map((name, index) => {
    const answer = data?.[index * 2]?.result as readonly [bigint, bigint] | undefined;
    return {
      name,
      index,
      price: answer?.[0],
      updatedAt: answer ? Number(answer[1]) : undefined,
      fresh: data?.[index * 2 + 1]?.result as boolean | undefined,
    };
  });

  return { prices, isLoading, refetch };
}

export function useSetPrices() {
  const tx = useTx();

  const setPrices = useCallback(
    (updates: { index: number; price: bigint }[]) =>
      tx.writeAndWait({
        address: requireContract("priceOracle"),
        abi: CommodityPriceOracleAbi,
        functionName: "setPrices",
        args: [updates.map((u) => u.index), updates.map((u) => u.price)],
      }),
    [tx],
  );

  return { ...tx, setPrices };
}

export type PoolLoan = Loan & { commodityId?: bigint };

/** Every loan in the pool, newest first, with live debt and health factor. */
export function useAllLoans() {
  const pool = contracts.lendingPool;

  const { data: count, refetch: refetchCount } = useReadContract({
    address: pool,
    abi: LendingPoolAbi,
    functionName: "loanCount",
    query: { enabled: Boolean(pool), refetchInterval: 10_000 },
  });

  const loanIds = useMemo(
    () => Array.from({ length: Number((count as bigint | undefined) ?? 0n) }, (_, i) => BigInt(i + 1)).reverse(),
    [count],
  );

  const { data, isLoading, refetch: refetchLoans } = useReadContracts({
    contracts: pool
      ? loanIds.flatMap((id) => [
        { address: pool, abi: LendingPoolAbi, functionName: "getLoanDetails" as const, args: [id] as const },
        { address: pool, abi: LendingPoolAbi, functionName: "getHealthFactor" as const, args: [id] as const },
        { address: pool, abi: LendingPoolAbi, functionName: "loans" as const, args: [id] as const },
      ])
      : [],
    query: { enabled: loanIds.length > 0, refetchInterval: 10_000 },
  });

  const loans: PoolLoan[] = useMemo(() => {
    if (!data) return [];
    return loanIds.flatMap((id, i) => {
      const details = data[i * 3]?.result as readonly [Address, bigint, bigint, number, bigint] | undefined;
      if (!details) return [];
      const record = data[i * 3 + 2]?.result as readonly unknown[] | undefined;
      return [{
        id,
        farmer: details[0],
        principal: details[1],
        collateralAmount: details[2],
        status: Number(details[3]),
        totalDebt: details[4],
        healthFactor: data[i * 3 + 1]?.result as bigint | undefined,
        commodityId: record?.[2] as bigint | undefined,
      }];
    });
  }, [data, loanIds]);

  const refetch = useCallback(async () => {
    await refetchCount();
    await refetchLoans();
  }, [refetchCount, refetchLoans]);

  return { loans, isLoading, refetch };
}

export function useLiquidate() {
  const tx = useTx();

  /** The liquidator pays the loan's debt, so the pool needs a USDC allowance first. */
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

  const liquidate = useCallback(
    (loanId: bigint) =>
      tx.writeAndWait({
        address: requireContract("lendingPool"),
        abi: LendingPoolAbi,
        functionName: "liquidate",
        args: [loanId],
      }),
    [tx],
  );

  return { ...tx, approveUsdc, liquidate };
}
