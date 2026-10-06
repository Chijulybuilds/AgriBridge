import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The local demo deployment the journeys run against: what `forge script
 * script/DeployDemo.s.sol` broadcast to Anvil (see the e2e job in CI, or
 * RUN_THE_APP.md). Without it the journeys are skipped and only the pages that
 * need no contracts are tested.
 */
const BROADCAST_FILE = join(__dirname, "..", "..", "broadcast", "DeployDemo.s.sol", "31337", "run-latest.json");

type Broadcast = { transactions: Array<{ transactionType: string; contractName: string; contractAddress: string }> };

export function localDeployment(): Record<string, string> | undefined {
  if (!existsSync(BROADCAST_FILE)) return undefined;
  const broadcast = JSON.parse(readFileSync(BROADCAST_FILE, "utf8")) as Broadcast;
  return Object.fromEntries(
    broadcast.transactions.filter((tx) => tx.transactionType === "CREATE").map((tx) => [tx.contractName, tx.contractAddress]),
  );
}

/** The app's NEXT_PUBLIC_* contract settings for the local deployment, or none. */
export function deploymentEnv(): Record<string, string> {
  const d = localDeployment();
  if (!d) return {};
  return {
    NEXT_PUBLIC_COMMODITY_CONFIG_ADDRESS: d.CommodityConfig,
    NEXT_PUBLIC_COMMODITY_REGISTRY_ADDRESS: d.CommodityRegistry,
    NEXT_PUBLIC_COMMODITY_TOKEN_ADDRESS: d.CommodityToken,
    NEXT_PUBLIC_COMMODITY_PRICE_ORACLE_ADDRESS: d.CommodityPriceOracle,
    NEXT_PUBLIC_AGRI_SHARE_TOKEN_ADDRESS: d.AgriShareToken,
    NEXT_PUBLIC_LENDING_POOL_ADDRESS: d.LendingPool,
    NEXT_PUBLIC_LIQUIDATION_KEEPER_ADDRESS: d.LiquidationKeeper,
    NEXT_PUBLIC_MARKETPLACE_ADDRESS: d.Marketplace,
    NEXT_PUBLIC_WAREHOUSE_DESK_ADDRESS: d.WarehouseDesk,
    NEXT_PUBLIC_USDC_ADDRESS: d.DemoUSDC,
  };
}
