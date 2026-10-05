#!/usr/bin/env node
/**
 * Plays the whole demo through the app with the one-click demo accounts, and checks
 * every step on-chain: register, verify, invest, borrow, repay in full, price crash,
 * liquidate, reset prices, withdraw, faucet. Run it before presenting.
 *
 *   npm run demo           (terminal 1: local chain + app)
 *   npm run demo:check     (terminal 2)
 *
 * Against another deployment, e.g. the online Sepolia demo:
 *   DEMO_CHECK_URL=https://your-app.vercel.app DEMO_CHECK_RPC=https://ethereum-sepolia-rpc.publicnode.com npm run demo:check
 * (needs .demo-wallets.json and broadcast/DeployDemo.s.sol/11155111 from `npm run demo:sepolia -- deploy`)
 *
 * Uses the installed Google Chrome; set DEMO_CHECK_BROWSER=chromium to use Playwright's own.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createPublicClient, formatUnits, http } from "viem";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = process.env.DEMO_CHECK_URL ?? "http://localhost:3000";
const RPC = process.env.DEMO_CHECK_RPC ?? "http://127.0.0.1:8545";
const RESULTS = join(root, "test-results");

const chain = createPublicClient({ transport: http(RPC) });
const chainId = await chain.getChainId();

const broadcastFile = join(root, "broadcast", "DeployDemo.s.sol", String(chainId), "run-latest.json");
if (!existsSync(broadcastFile)) {
  console.error(`No demo deployment found for chain ${chainId} (${broadcastFile}). Start one with npm run demo.`);
  process.exit(1);
}
const deployed = Object.fromEntries(
  JSON.parse(readFileSync(broadcastFile, "utf8"))
    .transactions.filter((tx) => tx.transactionType === "CREATE")
    .map((tx) => [tx.contractName, tx.contractAddress]),
);

// Local runs use Anvil's public test accounts #1-#3; other chains use .demo-wallets.json.
const wallets =
  chainId === 31337
    ? {
      verifier: { address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" },
      farmer: { address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" },
      investor: { address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" },
    }
    : JSON.parse(readFileSync(join(root, ".demo-wallets.json"), "utf8"));
const FARMER = wallets.farmer.address;
const INVESTOR = wallets.investor.address;
const VERIFIER = wallets.verifier.address;

function abi(name) {
  const source = readFileSync(join(root, "lib", "contracts", "abis", `${name}.ts`), "utf8");
  return JSON.parse(source.slice(source.indexOf("["), source.lastIndexOf("]") + 1));
}
const read = (contract, functionName, args = []) =>
  chain.readContract({ address: deployed[contract], abi: abi(contract), functionName, args });

const USDC = (n) => BigInt(n) * 10n ** 6n;
const KG = (n) => BigInt(n) * 10n ** 18n;
const STATUS = { Pending: 0, Verified: 1, Collateralized: 3, Released: 4, Liquidated: 5 };
const LOAN = { Repaid: 1, Liquidated: 2 };

async function until(check, what, timeout = 90_000) {
  const start = Date.now();
  for (;;) {
    if (await check().catch(() => false)) return;
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
const lotStatus = async (id) => Number((await read("CommodityRegistry", "getCommodity", [id])).status);
const loanStatus = async (id) => Number((await read("LendingPool", "getLoanDetails", [id]))[3]);

const browser = await chromium.launch({
  channel: process.env.DEMO_CHECK_BROWSER === "chromium" ? undefined : "chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, baseURL: BASE_URL });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

let passed = 0;
async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    passed++;
    console.log(`PASS ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  } catch (error) {
    mkdirSync(RESULTS, { recursive: true });
    await page.screenshot({ path: join(RESULTS, "demo-check-failure.png") });
    console.log(`FAIL ${name}: ${String(error.message).split("\n")[0]}`);
    console.log(`     screenshot: test-results/demo-check-failure.png`);
    await browser.close();
    process.exit(1);
  }
}

async function loginAs(role, dashboard) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByTestId(`demo-${role}`).click();
  await page.waitForURL(`**${dashboard}`, { timeout: 90_000 });
}
async function logout() {
  await page.getByText("Logout").first().click();
  await page.waitForURL("**/login", { timeout: 30_000 });
}
async function registerLot(type, kg) {
  const id = (await read("CommodityRegistry", "commodityCount")) + 1n;
  await page.goto("/farmer/tokenize", { waitUntil: "networkidle" });
  await page.getByTestId("commodity-type").selectOption(type);
  await page.getByTestId("quantity").fill(String(kg));
  await page.getByTestId("harvest-date").fill("2026-09-01");
  await page.getByTestId("storage-days").fill("90");
  await page.getByTestId("submit-tokenize").click();
  await until(async () => (await read("CommodityRegistry", "commodityCount")) >= id, `lot #${id} registered`);
  return id;
}
async function approveLot(id) {
  await page.goto("/admin/queue", { waitUntil: "networkidle" });
  await page.getByTestId(`approve-${id}`).click();
  await page.getByTestId("inspection-ref").fill("INSP-DEMO-001");
  await page.getByTestId("warehouse-ref").fill("WH-DEMO-07");
  await page.getByTestId("report-hash").fill(`0x${"ab".repeat(32)}`);
  await page.getByTestId("confirm-action").click();
  await until(async () => (await lotStatus(id)) === STATUS.Verified, `lot #${id} verified`);
}
async function borrow(lot, amount) {
  const loanId = (await read("LendingPool", "loanCount")) + 1n;
  await page.goto("/farmer/borrow", { waitUntil: "networkidle" });
  await page.getByTestId("collateral-select").selectOption(String(lot));
  await page.getByTestId("borrow-amount").fill(String(amount));
  if (!(await read("CommodityToken", "isApprovedForAll", [FARMER, deployed.LendingPool]))) {
    await page.getByTestId("submit-borrow").click(); // the first click approves the collateral
    await until(() => read("CommodityToken", "isApprovedForAll", [FARMER, deployed.LendingPool]), "collateral approval");
    await page.waitForTimeout(1500);
  }
  await page.getByTestId("submit-borrow").click();
  await until(async () => (await read("LendingPool", "loanCount")) >= loanId, `loan #${loanId} opened`);
  return loanId;
}

console.log(`Checking the demo at ${BASE_URL} on chain ${chainId}\n`);
let cocoa, cashew, safeLoan, riskyLoan;

await step("Demo Farmer signs in with one click", () => loginAs("farmer", "/farmer/dashboard"));
await step("Farmer registers 1,000 kg of cocoa (Pending)", async () => {
  cocoa = await registerLot("Cocoa", 1000);
});
await step("Demo Verifier approves the cocoa; crop tokens are minted to the farmer", async () => {
  await logout();
  await loginAs("verifier", "/admin/dashboard");
  await approveLot(cocoa);
  if ((await read("CommodityToken", "balanceOf", [FARMER, cocoa])) !== KG(1000)) throw new Error("tokens not minted");
});
await step("Demo Investor deposits 10,000 test USDC into the pool", async () => {
  await logout();
  await loginAs("investor", "/investor/dashboard");
  const before = await read("LendingPool", "totalAssets");
  await page.goto("/investor/deposit", { waitUntil: "networkidle" });
  await page.getByTestId("amount-input").fill("10000");
  await page.getByTestId("submit-tx").click(); // approve
  await until(async () => (await read("DemoUSDC", "allowance", [INVESTOR, deployed.LendingPool])) >= USDC(10_000), "USDC approval");
  await page.waitForTimeout(1500);
  await page.getByTestId("submit-tx").click(); // deposit
  await until(async () => (await read("LendingPool", "totalAssets")) >= before + USDC(10_000), "deposit");
});
await step("Farmer borrows $4,000 against the cocoa (Collateralized)", async () => {
  await logout();
  await loginAs("farmer", "/farmer/dashboard");
  safeLoan = await borrow(cocoa, 4000);
  if ((await lotStatus(cocoa)) !== STATUS.Collateralized) throw new Error("lot not Collateralized");
});
await step("Farmer repays in full; the loan closes and the cocoa comes back (Released)", async () => {
  await page.goto("/farmer/loans", { waitUntil: "networkidle" });
  await page.getByTestId(`loan-${safeLoan}`).getByTestId("open-repay").click();
  await page.getByRole("button", { name: "Full" }).click();
  await page.getByTestId("submit-repay").click();
  await until(async () => (await loanStatus(safeLoan)) === LOAN.Repaid, "loan repaid");
  if ((await lotStatus(cocoa)) !== STATUS.Released) throw new Error("lot not Released");
  if ((await read("CommodityToken", "balanceOf", [FARMER, cocoa])) !== KG(1000)) throw new Error("collateral not returned");
});
await step("Farmer registers cashew, the verifier approves it, the farmer borrows $2,000", async () => {
  cashew = await registerLot("Cashew", 1000);
  await logout();
  await loginAs("verifier", "/admin/dashboard");
  await approveLot(cashew);
  await logout();
  await loginAs("farmer", "/farmer/dashboard");
  riskyLoan = await borrow(cashew, 2000);
});
await step("Verifier simulates a price crash; the cashew loan drops below health 1.00", async () => {
  await logout();
  await loginAs("verifier", "/admin/dashboard");
  await page.goto("/admin/prices", { waitUntil: "networkidle" });
  await page.getByTestId("price-crash").click();
  await until(async () => (await read("LendingPool", "getHealthFactor", [riskyLoan])) < 10n ** 18n, "loan under water");
});
await step("Verifier liquidates the loan from the Loans page (Liquidated)", async () => {
  await page.goto("/admin/loans", { waitUntil: "networkidle" });
  await page.getByTestId(`liquidate-${riskyLoan}`).click();
  await until(async () => (await loanStatus(riskyLoan)) === LOAN.Liquidated, "loan liquidated");
  if ((await lotStatus(cashew)) !== STATUS.Liquidated) throw new Error("lot not Liquidated");
  if ((await read("CommodityToken", "balanceOf", [VERIFIER, cashew])) !== KG(1000)) throw new Error("collateral not seized");
});
await step("Verifier resets prices to the starting values", async () => {
  await page.goto("/admin/prices", { waitUntil: "networkidle" });
  await page.getByTestId("price-reset").click();
  await until(async () => (await read("CommodityPriceOracle", "getPrice", [3]))[0] === 320_000_000n, "prices reset");
});
await step("Investor withdraws everything, ending with at least what they put in", async () => {
  await logout();
  await loginAs("investor", "/investor/dashboard");
  const shares = await read("AgriShareToken", "balanceOf", [INVESTOR]);
  const before = await read("DemoUSDC", "balanceOf", [INVESTOR]);
  await page.goto("/investor/deposit", { waitUntil: "networkidle" });
  await page.getByTestId("mode-withdraw").click();
  await page.getByTestId("amount-input").fill(formatUnits(shares, 6));
  await page.getByTestId("submit-tx").click();
  await until(async () => (await read("AgriShareToken", "balanceOf", [INVESTOR])) === 0n, "shares redeemed");
  const received = (await read("DemoUSDC", "balanceOf", [INVESTOR])) - before;
  if (received < USDC(10_000) - 1n) throw new Error(`received only ${formatUnits(received, 6)} USDC`);
  console.log(`     withdrew ${formatUnits(received, 6)} USDC for a 10,000 deposit`);
});
await step("The faucet button gives the farmer 10,000 more test USDC", async () => {
  await logout();
  await loginAs("farmer", "/farmer/dashboard");
  const before = await read("DemoUSDC", "balanceOf", [FARMER]);
  await page.getByTestId("demo-faucet").click();
  await until(async () => (await read("DemoUSDC", "balanceOf", [FARMER])) === before + USDC(10_000), "faucet mint");
});

await browser.close();
console.log(`\n${passed} of 12 steps passed. Uncaught page errors: ${pageErrors.length}`);
if (pageErrors.length) {
  console.log(pageErrors.slice(0, 5).map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
