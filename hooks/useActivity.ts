import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { formatUnits, zeroAddress, type Address, type Hex, type Log } from "viem";

import {
  CommodityPriceOracleAbi,
  CommodityRegistryAbi,
  DemoUSDCAbi,
  LendingPoolAbi,
} from "../lib/contracts/abis";
import {
  COMMODITY_TYPES,
  PRICE_DECIMALS,
  QUANTITY_DECIMALS,
  USDC_DECIMALS,
  contracts,
  contractsConfigured,
} from "../lib/contracts/config";

export type ActivityItem = {
  key: string;
  txHash: Hex;
  blockNumber: bigint;
  logIndex: number;
  timestamp?: number;
  text: string;
};

/** First block worth scanning: the deployment block, when the deploy script recorded it. */
const DEPLOY_BLOCK = process.env.NEXT_PUBLIC_DEPLOY_BLOCK ? BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK) : undefined;
/** Public RPCs cap how many blocks one log query may span. */
const CHUNK = 10_000n;
/** Without a deployment block, look back about a week of Sepolia blocks. */
const FALLBACK_LOOKBACK = 50_000n;
const MAX_ITEMS = 60;

const blockTimes = new Map<bigint, number>();

const short = (address: Address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const usd = (value: bigint) =>
  `$${Number(formatUnits(value, USDC_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const kg = (value: bigint) => `${Number(formatUnits(value, QUANTITY_DECIMALS)).toLocaleString()} kg`;
const commodity = (index: number) => COMMODITY_TYPES[index] ?? `commodity ${index}`;

type DecodedLog = Log<bigint, number, false> & { eventName: string; args: Record<string, unknown> };

/** Turns one protocol event into a sentence; returns null for events the feed does not show. */
function describe(log: DecodedLog): string | null {
  const a = log.args;
  switch (log.eventName) {
    case "CommodityRegistered":
      return `Farmer ${short(a.farmer as Address)} registered ${kg(a.quantity as bigint)} of ${commodity(Number(a.commodityType))} (lot #${a.commodityId})`;
    case "CommodityApproved":
      return `Verifier ${short(a.verifier as Address)} approved lot #${a.commodityId}; its crop tokens were minted`;
    case "CommodityRejected":
      return `Verifier ${short(a.verifier as Address)} rejected lot #${a.commodityId}`;
    case "LiquidityDeposited":
      return `Investor ${short(a.investor as Address)} deposited ${usd(a.assets as bigint)} into the pool`;
    case "LiquidityWithdrawn":
      return `Investor ${short(a.investor as Address)} withdrew ${usd(a.assetsReturned as bigint)} from the pool`;
    case "LoanOpened":
      return `Farmer ${short(a.farmer as Address)} borrowed ${usd(a.principal as bigint)} against lot #${a.commodityId} (loan #${a.loanId})`;
    case "LoanRepaid": {
      const paid = (a.principalPaid as bigint) + (a.interestPaid as bigint);
      return (a.remainingPrincipal as bigint) === 0n
        ? `Farmer ${short(a.farmer as Address)} repaid loan #${a.loanId} in full (${usd(paid)}); the crop tokens went back`
        : `Farmer ${short(a.farmer as Address)} repaid ${usd(paid)} of loan #${a.loanId}`;
    }
    case "LoanLiquidated":
      return `Loan #${a.loanId} was liquidated by ${short(a.liquidator as Address)}: paid ${usd(a.debtCovered as bigint)}, took ${kg(a.collateralSeized as bigint)}`;
    case "Transfer":
      return `${short(a.to as Address)} received ${usd(a.value as bigint).slice(1)} test USDC from the faucet`;
    default:
      return null;
  }
}

/**
 * Recent protocol events, newest first, each tied to the transaction that caused it,
 * so every action in the app can be opened on the block explorer.
 */
export function useActivity() {
  const client = usePublicClient();
  const { registry, lendingPool, priceOracle, usdc } = contracts;

  return useQuery({
    queryKey: ["activity", registry, lendingPool, priceOracle, usdc, DEPLOY_BLOCK?.toString()],
    enabled: Boolean(client && contractsConfigured()),
    refetchInterval: 15_000,
    queryFn: async (): Promise<ActivityItem[]> => {
      if (!client || !registry || !lendingPool || !priceOracle || !usdc) return [];
      const latest = await client.getBlockNumber();
      const first = DEPLOY_BLOCK ?? (latest > FALLBACK_LOOKBACK ? latest - FALLBACK_LOOKBACK : 0n);

      const logs: DecodedLog[] = [];
      for (let from = first; from <= latest; from += CHUNK) {
        const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
        const range = { fromBlock: from, toBlock: to };
        const batches = await Promise.all([
          client.getContractEvents({ address: registry, abi: CommodityRegistryAbi, ...range }),
          client.getContractEvents({ address: lendingPool, abi: LendingPoolAbi, ...range }),
          client.getContractEvents({ address: priceOracle, abi: CommodityPriceOracleAbi, eventName: "PriceUpdated", ...range }),
          client.getContractEvents({ address: usdc, abi: DemoUSDCAbi, eventName: "Transfer", args: { from: zeroAddress }, ...range }),
        ]);
        for (const batch of batches) logs.push(...(batch as unknown as DecodedLog[]));
      }

      // Newest first. Price updates sent together (a crash or a reset) become one line.
      logs.sort((x, y) => (x.blockNumber === y.blockNumber ? y.logIndex - x.logIndex : x.blockNumber > y.blockNumber ? -1 : 1));
      const items: ActivityItem[] = [];
      const prices = new Map<Hex, ActivityItem>();
      for (const log of logs) {
        if (log.eventName === "PriceUpdated") {
          const part = `${commodity(Number(log.args.commodity))} $${Number(formatUnits(log.args.newPrice as bigint, PRICE_DECIMALS)).toFixed(2)}`;
          const existing = prices.get(log.transactionHash);
          if (existing) {
            existing.text = existing.text.replace(": ", `: ${part}, `);
          } else {
            const item = {
              key: `${log.transactionHash}-prices`,
              txHash: log.transactionHash,
              blockNumber: log.blockNumber,
              logIndex: log.logIndex,
              text: `${short(log.args.updater as Address)} set prices (per kg): ${part}`,
            };
            prices.set(log.transactionHash, item);
            items.push(item);
          }
          continue;
        }
        const text = describe(log);
        if (text) {
          items.push({
            key: `${log.transactionHash}-${log.logIndex}`,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            logIndex: log.logIndex,
            text,
          });
        }
      }

      const recent = items.slice(0, MAX_ITEMS);
      const missing = [...new Set(recent.map((i) => i.blockNumber))].filter((b) => !blockTimes.has(b));
      await Promise.all(
        missing.map(async (blockNumber) => {
          const block = await client.getBlock({ blockNumber });
          blockTimes.set(blockNumber, Number(block.timestamp));
        }),
      );
      return recent.map((item) => ({ ...item, timestamp: blockTimes.get(item.blockNumber) }));
    },
  });
}
