#!/usr/bin/env node
/**
 * One command for a local demo with play money:
 *   1. starts a private Anvil chain on :8545 (or reuses one that is already running),
 *   2. deploys a fresh demo protocol with script/DeployDemo.s.sol,
 *   3. starts the app with one-click Demo Verifier / Farmer / Investor accounts.
 *
 * Usage:  npm run demo         (Ctrl+C stops everything)
 *
 * Needs Foundry's `anvil` and `forge` (https://getfoundry.sh). They are looked up in
 * $FOUNDRY_BIN, then ~/.foundry/bin, then PATH. Stop any other `next dev` for this
 * folder first: Next.js allows only one dev server per project.
 *
 * Everything runs on a throwaway local chain. The accounts come from Anvil's public
 * test mnemonic and hold nothing on any real network.
 */
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toHex } from "viem";
import { mnemonicToAccount } from "viem/accounts";

import { foundryTool } from "./foundry-tools.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RPC = "http://127.0.0.1:8545";
const CHAIN_ID = 31337;
const PORT = process.env.PORT ?? "3000";

// Anvil's default, publicly documented test mnemonic: #0 deploys, #1-#3 are the demo accounts.
const MNEMONIC = "test test test test test test test test test test test junk";
const account = (index) => mnemonicToAccount(MNEMONIC, { addressIndex: index });
const privateKey = (index) => toHex(account(index).getHdKey().privateKey);

async function chainIsUp() {
  try {
    const response = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    return (await response.json()).result === toHex(CHAIN_ID);
  } catch {
    return false;
  }
}

const children = [];
function exit(code) {
  for (const child of children) child.kill();
  process.exit(code);
}
process.on("SIGINT", () => exit(0));
process.on("SIGTERM", () => exit(0));

// 1. Chain
if (await chainIsUp()) {
  console.log("• Reusing the local chain already running on :8545");
} else {
  console.log("• Starting a private local chain (Anvil) on :8545 …");
  const anvil = spawn(foundryTool("anvil"), ["--chain-id", String(CHAIN_ID), "--quiet"], { stdio: "inherit" });
  anvil.on("error", (error) => {
    console.error(`Could not start anvil (${error.message}). Install Foundry: https://getfoundry.sh`);
    exit(1);
  });
  children.push(anvil);
  for (let attempt = 0; attempt < 50 && !(await chainIsUp()); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!(await chainIsUp())) {
    console.error("The local chain did not start.");
    exit(1);
  }
}

// 2. Contracts
console.log("• Deploying the demo contracts …");
const deploy = spawnSync(
  foundryTool("forge"),
  ["script", "script/DeployDemo.s.sol:DeployDemo", "--rpc-url", RPC, "--private-key", privateKey(0), "--broadcast", "--quiet"],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      DEMO_VERIFIER: account(1).address,
      DEMO_FARMER: account(2).address,
      DEMO_INVESTOR: account(3).address,
    },
  },
);
if (deploy.error || deploy.status !== 0) {
  console.error(`Deployment failed${deploy.error ? `: ${deploy.error.message}` : "."}`);
  exit(1);
}

const broadcast = JSON.parse(
  readFileSync(join(root, "broadcast", "DeployDemo.s.sol", String(CHAIN_ID), "run-latest.json"), "utf8"),
);
const deployed = Object.fromEntries(
  broadcast.transactions
    .filter((tx) => tx.transactionType === "CREATE")
    .map((tx) => [tx.contractName, tx.contractAddress]),
);

// Set in the app's environment, which takes precedence over any .env file.
const appEnv = {
  NEXT_PUBLIC_CHAIN_ID: String(CHAIN_ID),
  NEXT_PUBLIC_RPC_URL: RPC,
  NEXT_PUBLIC_COMMODITY_REGISTRY_ADDRESS: deployed.CommodityRegistry,
  NEXT_PUBLIC_COMMODITY_TOKEN_ADDRESS: deployed.CommodityToken,
  NEXT_PUBLIC_COMMODITY_PRICE_ORACLE_ADDRESS: deployed.CommodityPriceOracle,
  NEXT_PUBLIC_AGRI_SHARE_TOKEN_ADDRESS: deployed.AgriShareToken,
  NEXT_PUBLIC_LENDING_POOL_ADDRESS: deployed.LendingPool,
  NEXT_PUBLIC_USDC_ADDRESS: deployed.DemoUSDC,
  NEXT_PUBLIC_DEMO_VERIFIER_KEY: privateKey(1),
  NEXT_PUBLIC_DEMO_FARMER_KEY: privateKey(2),
  NEXT_PUBLIC_DEMO_INVESTOR_KEY: privateKey(3),
};

// 3. App
console.log(`• Starting the app on http://localhost:${PORT}`);
console.log("  Open /login and pick a demo account. Ctrl+C stops the app and the chain.\n");
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
const app = spawn(process.execPath, [nextBin, "dev", "-p", PORT], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, ...appEnv },
});
children.push(app);
app.on("exit", (code) => exit(code ?? 0));
