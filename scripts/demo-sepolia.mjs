#!/usr/bin/env node
/**
 * Online demo on Sepolia, with play money (DemoUSDC) and three demo accounts.
 *
 *   npm run demo:sepolia -- wallets   create the demo wallets (saved to .demo-wallets.json, gitignored)
 *   npm run demo:sepolia -- status    show the Sepolia ETH each wallet holds
 *   npm run demo:sepolia -- deploy    deploy the demo contracts, then print the app settings
 *   npm run demo:sepolia -- env       print the app settings again (for Vercel or .env.local)
 *
 * Needs SEPOLIA_URL and DEPLOYER_PRIVATE_KEY, from the environment or from .env. The
 * deployer must be a NEW wallet funded with Sepolia ETH: it keeps admin rights over the
 * demo contracts, so its key must stay private. The demo wallets' keys end up in the
 * app (anyone can use the demo accounts); they only ever hold Sepolia test ETH.
 * See DEMO.md for the full walkthrough.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, formatEther, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

import { foundryTool } from "./foundry-tools.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WALLETS_FILE = join(root, ".demo-wallets.json");
const ROLES = ["verifier", "farmer", "investor"];
const PUBLIC_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

// Keys from this repo that were published in its git history. Never deploy with them.
const LEAKED = new Set([
  "0xb7d98ba6c40afb154ba36d014a2c0658ecbe4f99",
  "0xc54dc06a05f70891332940aa877ce0422266191f",
]);

/** Reads KEY=value lines from .env without overriding the real environment. */
function loadDotEnv() {
  const file = join(root, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function readWallets() {
  if (!existsSync(WALLETS_FILE)) fail("No demo wallets yet. Run: npm run demo:sepolia -- wallets");
  return JSON.parse(readFileSync(WALLETS_FILE, "utf8"));
}

function deployerAccount() {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) fail("Set DEPLOYER_PRIVATE_KEY (in your shell or in .env) to a new wallet funded with Sepolia ETH.");
  const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
  if (LEAKED.has(account.address.toLowerCase())) {
    fail(`${account.address} is one of the keys leaked in this repo's git history. Create a new wallet.`);
  }
  return account;
}

const rpcUrl = () => process.env.SEPOLIA_URL || PUBLIC_RPC;

async function status() {
  const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl()) });
  const wallets = readWallets();
  const rows = ROLES.map((role) => [`demo ${role}`, wallets[role].address]);
  if (process.env.DEPLOYER_PRIVATE_KEY) rows.unshift(["deployer", deployerAccount().address]);
  for (const [name, address] of rows) {
    const balance = await client.getBalance({ address });
    console.log(`${name.padEnd(15)} ${address}  ${formatEther(balance)} Sepolia ETH`);
  }
  console.log("\nFund each wallet from a Sepolia faucet: about 0.1 ETH for the deployer, 0.05 for each demo wallet.");
}

function printEnv() {
  const wallets = readWallets();
  const file = join(root, "broadcast", "DeployDemo.s.sol", String(sepolia.id), "run-latest.json");
  if (!existsSync(file)) fail("No Sepolia demo deployment found. Run: npm run demo:sepolia -- deploy");
  const deployed = Object.fromEntries(
    JSON.parse(readFileSync(file, "utf8"))
      .transactions.filter((tx) => tx.transactionType === "CREATE")
      .map((tx) => [tx.contractName, tx.contractAddress]),
  );
  console.log("\nApp settings (Vercel → Settings → Environment Variables, or .env.local):\n");
  console.log(`NEXT_PUBLIC_CHAIN_ID=${sepolia.id}`);
  console.log(`NEXT_PUBLIC_RPC_URL=${PUBLIC_RPC}`);
  console.log(`NEXT_PUBLIC_COMMODITY_REGISTRY_ADDRESS=${deployed.CommodityRegistry}`);
  console.log(`NEXT_PUBLIC_COMMODITY_TOKEN_ADDRESS=${deployed.CommodityToken}`);
  console.log(`NEXT_PUBLIC_COMMODITY_PRICE_ORACLE_ADDRESS=${deployed.CommodityPriceOracle}`);
  console.log(`NEXT_PUBLIC_AGRI_SHARE_TOKEN_ADDRESS=${deployed.AgriShareToken}`);
  console.log(`NEXT_PUBLIC_LENDING_POOL_ADDRESS=${deployed.LendingPool}`);
  console.log(`NEXT_PUBLIC_USDC_ADDRESS=${deployed.DemoUSDC}`);
  for (const role of ROLES) console.log(`NEXT_PUBLIC_DEMO_${role.toUpperCase()}_KEY=${wallets[role].privateKey}`);
  console.log("\nThe demo keys become public once the app is online. They must only ever hold Sepolia test ETH.");
}

loadDotEnv();
const command = process.argv[2];

if (command === "wallets") {
  if (existsSync(WALLETS_FILE)) {
    console.log(`Demo wallets already exist in ${WALLETS_FILE} (delete it to start over).`);
  } else {
    const wallets = Object.fromEntries(
      ROLES.map((role) => {
        const privateKey = generatePrivateKey();
        return [role, { address: privateKeyToAccount(privateKey).address, privateKey }];
      }),
    );
    writeFileSync(WALLETS_FILE, `${JSON.stringify(wallets, null, 2)}\n`);
    console.log(`Created ${WALLETS_FILE}`);
  }
  const wallets = readWallets();
  for (const role of ROLES) console.log(`demo ${role.padEnd(9)} ${wallets[role].address}`);
  console.log("\nNext: send Sepolia ETH to these addresses and to your deployer, then run the deploy step.");
} else if (command === "status") {
  await status();
} else if (command === "deploy") {
  const wallets = readWallets();
  const deployer = deployerAccount();
  console.log(`Deploying the demo to Sepolia from ${deployer.address} …`);
  const result = spawnSync(
    foundryTool("forge"),
    [
      "script", "script/DeployDemo.s.sol:DeployDemo",
      "--rpc-url", rpcUrl(),
      "--private-key", process.env.DEPLOYER_PRIVATE_KEY,
      "--broadcast", "--slow",
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        DEMO_VERIFIER: wallets.verifier.address,
        DEMO_FARMER: wallets.farmer.address,
        DEMO_INVESTOR: wallets.investor.address,
      },
    },
  );
  if (result.error || result.status !== 0) fail(`Deployment failed${result.error ? `: ${result.error.message}` : "."}`);
  printEnv();
} else if (command === "env") {
  printEnv();
} else {
  console.log("Usage: npm run demo:sepolia -- <wallets | status | deploy | env>   (see DEMO.md)");
}
