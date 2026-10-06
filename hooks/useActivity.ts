import { useQuery } from "@tanstack/react-query";
import { zeroAddress, type Address, type Hex, type Log } from "viem";

import {
  CommodityConfigAbi,
  CommodityPriceOracleAbi,
  CommodityRegistryAbi,
  DemoUSDCAbi,
  LendingPoolAbi,
  MarketplaceAbi,
  WarehouseDeskAbi,
} from "../lib/contracts/abis";
import { contracts, contractsConfigured, DEPLOY_BLOCK, GRADES } from "../lib/contracts/config";
import { publicClient } from "../lib/chain";
import { kg, pricePerKg, shortAddress, usd } from "../lib/format";

export type ActivityItem = {
  key: string;
  txHash: Hex;
  blockNumber: bigint;
  logIndex: number;
  timestamp?: number;
  text: string;
};

type DecodedLog = Log<bigint, number, false> & { eventName: string; args: Record<string, unknown> };

/** Public RPCs cap how many blocks one log query may span. */
const CHUNK = 10_000n;
/** Without a deployment block, look back about a week of Sepolia blocks. */
const FALLBACK_LOOKBACK = 50_000n;
const MAX_ITEMS = 80;

const blockTimes = new Map<bigint, number>();

/**
 * Reads logs in block chunks from the deployment block (or the last week) to now.
 * Each fetcher returns the decoded logs of one contract for one block range.
 */
export async function scanLogs(
  fetchers: Array<(range: { fromBlock: bigint; toBlock: bigint }) => Promise<unknown[]>>,
): Promise<DecodedLog[]> {
  const latest = await publicClient.getBlockNumber();
  const first = DEPLOY_BLOCK ?? (latest > FALLBACK_LOOKBACK ? latest - FALLBACK_LOOKBACK : 0n);
  const logs: DecodedLog[] = [];
  for (let from = first; from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
    const batches = await Promise.all(fetchers.map((fetch) => fetch({ fromBlock: from, toBlock: to })));
    for (const batch of batches) logs.push(...(batch as DecodedLog[]));
  }
  // Newest first.
  return logs.sort((x, y) => (x.blockNumber === y.blockNumber ? y.logIndex - x.logIndex : x.blockNumber > y.blockNumber ? -1 : 1));
}

/** Adds block times to items, fetching each block once per session. */
export async function withTimes<T extends { blockNumber: bigint }>(items: T[]): Promise<Array<T & { timestamp?: number }>> {
  const missing = [...new Set(items.map((i) => i.blockNumber))].filter((b) => !blockTimes.has(b));
  await Promise.all(
    missing.map(async (blockNumber) => {
      const block = await publicClient.getBlock({ blockNumber });
      blockTimes.set(blockNumber, Number(block.timestamp));
    }),
  );
  return items.map((item) => ({ ...item, timestamp: blockTimes.get(item.blockNumber) }));
}

/** One protocol event as a sentence; null for events the feed leaves out. */
function describe(log: DecodedLog, commodityNames: Map<bigint, string>): string | null {
  const a = log.args;
  const who = (key: string) => shortAddress(a[key] as Address);
  switch (log.eventName) {
    case "IntakeRequested":
      return `${who("farmer")} booked a delivery of about ${kg(a.estimatedKg as bigint)} (lot ${a.lotId})`;
    case "IntakeApproved":
      return `The warehouse verified lot ${a.lotId}: ${kg(a.measuredKg as bigint)}, Grade ${GRADES[Number(a.grade)] ?? "?"}`;
    case "IntakeRejected":
      return `The warehouse rejected lot ${a.lotId}`;
    case "IntakeCancelled":
      return `Lot ${a.lotId}'s delivery was cancelled`;
    case "LotFrozen":
      return a.frozen ? `The regulator froze lot ${a.lotId}` : `The regulator unfroze lot ${a.lotId}`;
    case "WarehouseFrozen":
      return a.frozen ? `The regulator froze warehouse ${a.warehouseId}` : `The regulator unfroze warehouse ${a.warehouseId}`;
    case "StockReleased":
      return `${kg(a.kg as bigint)} of lot ${a.lotId} left the warehouse`;
    case "LiquidityDeposited":
      return `${who("investor")} invested ${usd(a.assets as bigint)} in the pool`;
    case "LiquidityWithdrawn":
      return `${who("investor")} withdrew ${usd(a.assetsReturned as bigint)} from the pool`;
    case "LoanOpened":
      return `${who("borrower")} took a ${usd(a.principal as bigint)} advance against ${kg(a.collateralKg as bigint)} of lot ${a.lotId}`;
    case "LoanRepaid":
      return (a.remainingDebt as bigint) === 0n
        ? `Advance ${a.loanId} was repaid in full (${usd(a.amount as bigint)}); the crop went back`
        : `${usd(a.amount as bigint)} was repaid on advance ${a.loanId}`;
    case "LoanLiquidated":
      return `Advance ${a.loanId} was settled by selling ${kg(a.kgSeized as bigint)} of its crop; ${kg(a.kgReturned as bigint)} went back to the farmer`;
    case "Listed":
      return `${who("seller")} listed ${kg(a.kg as bigint)} of lot ${a.lotId} for sale`;
    case "Bought":
      return `${who("buyer")} bought ${kg(a.kg as bigint)} of lot ${a.lotId} for ${usd(a.cost as bigint)}`;
    case "ExpiredStockSold":
      return `${who("seller")} sold ${kg(a.kg as bigint)} of expired lot ${a.lotId} to AgriBridge for ${usd(a.paid as bigint)}`;
    case "WithdrawalRequested":
      return `${who("holder")} asked to collect ${kg(a.kg as bigint)} of lot ${a.lotId}`;
    case "WithdrawalReleased":
      return `The warehouse released collection request ${a.requestId}`;
    case "PriceUpdated":
      return `${commodityNames.get(a.commodityId as bigint) ?? `Commodity ${a.commodityId}`} is now priced at ${pricePerKg(a.price as bigint)}`;
    case "Transfer":
      return `${who("to")} received ${usd(a.value as bigint)} of test dollars`;
    default:
      return null;
  }
}

/**
 * Recent protocol events, newest first, each tied to the transaction that caused
 * it, so every action in the app can be checked on the block explorer.
 */
export function useActivity() {
  const { registry, pool, marketplace, desk, oracle, usdc } = contracts;
  return useQuery({
    queryKey: ["activity", registry, pool, marketplace, desk, oracle, usdc, DEPLOY_BLOCK?.toString()],
    enabled: contractsConfigured(),
    refetchInterval: 20_000,
    queryFn: async (): Promise<ActivityItem[]> => {
      const logs = await scanLogs([
        (range) => publicClient.getContractEvents({ address: registry!, abi: CommodityRegistryAbi, ...range }),
        (range) => publicClient.getContractEvents({ address: pool!, abi: LendingPoolAbi, ...range }),
        (range) => publicClient.getContractEvents({ address: marketplace!, abi: MarketplaceAbi, ...range }),
        (range) => publicClient.getContractEvents({ address: desk!, abi: WarehouseDeskAbi, ...range }),
        (range) => publicClient.getContractEvents({ address: oracle!, abi: CommodityPriceOracleAbi, eventName: "PriceUpdated", ...range }),
        (range) =>
          publicClient.getContractEvents({ address: usdc!, abi: DemoUSDCAbi, eventName: "Transfer", args: { from: zeroAddress }, ...range }),
      ]);
      const commodityNames = new Map<bigint, string>();
      const count = await publicClient.readContract({ address: contracts.config!, abi: CommodityConfigAbi, functionName: "commodityCount" });
      for (let id = 1n; id <= count; id++) {
        const row = await publicClient.readContract({ address: contracts.config!, abi: CommodityConfigAbi, functionName: "getCommodity", args: [id] });
        commodityNames.set(id, row.name);
      }

      const items: ActivityItem[] = [];
      for (const log of logs) {
        const text = describe(log, commodityNames);
        if (!text) continue;
        items.push({ key: `${log.transactionHash}-${log.logIndex}`, txHash: log.transactionHash, blockNumber: log.blockNumber, logIndex: log.logIndex, text });
        if (items.length >= MAX_ITEMS) break;
      }
      return withTimes(items);
    },
  });
}

export type PoolMove = { key: string; kind: "Invested" | "Withdrew"; amount: bigint; blockNumber: bigint; txHash: Hex; timestamp?: number };

/** An investor's deposits and withdrawals, newest first. */
export function usePoolHistory(investor?: Address) {
  const pool = contracts.pool;
  return useQuery({
    queryKey: ["pool-history", pool, investor, DEPLOY_BLOCK?.toString()],
    enabled: Boolean(pool && investor),
    refetchInterval: 30_000,
    queryFn: async (): Promise<PoolMove[]> => {
      const logs = await scanLogs([
        (range) =>
          publicClient.getContractEvents({ address: pool!, abi: LendingPoolAbi, eventName: "LiquidityDeposited", args: { investor }, ...range }),
        (range) =>
          publicClient.getContractEvents({ address: pool!, abi: LendingPoolAbi, eventName: "LiquidityWithdrawn", args: { investor }, ...range }),
      ]);
      const moves = logs.map((log) => ({
        key: `${log.transactionHash}-${log.logIndex}`,
        kind: log.eventName === "LiquidityDeposited" ? ("Invested" as const) : ("Withdrew" as const),
        amount: (log.eventName === "LiquidityDeposited" ? log.args.assets : log.args.assetsReturned) as bigint,
        blockNumber: log.blockNumber,
        txHash: log.transactionHash,
      }));
      return withTimes(moves);
    },
  });
}
