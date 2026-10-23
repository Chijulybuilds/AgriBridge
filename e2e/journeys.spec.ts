import { test, expect, type Browser, type Page } from "@playwright/test";
import { encodeFunctionData, keccak256, toHex } from "viem";

import { CommodityRegistryAbi, ERC20Abi } from "../lib/contracts/abis";
import { localDeployment } from "./fixtures/deployment";
import { ACCOUNTS, installMockWallet, rpc, signIn, type AccountName } from "./fixtures/mockWallet";

/**
 * The whole story, on a local chain, through the real screens:
 * a farmer delivers cocoa, the Safe grades it, the farmer borrows and repays,
 * sells with a bulk deal, a buyer buys and collects, an investor invests, a price
 * crash is settled from the loss cushion, the regulator freezes a lot, and expired
 * stock goes through clearance. Each step depends on the one before.
 */
const deployment = localDeployment();
test.skip(!deployment, "Deploy the demo to Anvil first: see RUN_THE_APP.md");
// Each journey sends several transactions and, on a cold dev server, compiles pages on first visit.
test.describe.configure({ mode: "serial", timeout: 300_000 });

const SHOTS = process.env.E2E_SHOTS;
async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/** Waits for the transaction step `step` to finish, and fails with the app's own message if it did. */
async function confirmed(scope: Page | ReturnType<Page["locator"]>, step: string) {
  const ofStep = `[data-testid="tx-status"][data-step="${step}"]`;
  const done = scope.locator(`${ofStep}[data-status="confirmed"]`);
  const failed = scope.locator(`${ofStep}[data-status="failed"]`);
  await expect(done.or(failed).first()).toBeVisible({ timeout: 60_000 });
  // count() doesn't wait, so a status that has since been replaced reads as done.
  if ((await failed.count()) > 0) throw new Error(`"${step}" failed: ${await failed.first().innerText()}`);
}

/** Moves the local chain's clock on, for waits the contracts measure (a held price's confirmation). */
async function passMinutes(minutes: number) {
  await rpc("evm_increaseTime", [minutes * 60]);
  await rpc("evm_mine", []);
}

async function openAs(browser: Browser, account: AccountName): Promise<Page> {
  const page = await browser.newPage();
  page.on("console", (message) => {
    // The dev server's hot-reload socket is noise here.
    if (message.type() === "error" && !message.text().includes("webpack-hmr")) {
      console.log(`[${account} console] ${message.text().slice(0, 300)}`);
    }
  });
  await installMockWallet(page, account);
  return page;
}

async function openVerifier(browser: Browser): Promise<Page> {
  const page = await openAs(browser, "verifier");
  await page.goto("/verifier");
  await page.getByTestId("verifier-connect").filter({ hasText: "Mock Wallet" }).click();
  await expect(page.getByTestId("verifier-safe")).toBeVisible();
  return page;
}

test("1. a farmer books a delivery of cocoa", async ({ browser }) => {
  const page = await openAs(browser, "farmer");
  await signIn(page, "farmer");
  await page.goto("/farmer/deliver");

  await page.getByTestId("commodity").selectOption({ label: "Cocoa" });
  await page.getByTestId("warehouse").selectOption({ index: 1 });
  await page.getByTestId("quantity").fill("1000");
  await page.getByTestId("harvest-date").fill(isoDay(0));
  await page.getByTestId("submit-delivery").click();

  await confirmed(page, "Book the delivery");
  await expect(page.getByTestId("deliveries")).toContainText("Pending");
  await shot(page, "01-delivery-booked");
});

test("2. the Safe weighs, grades and approves it", async ({ browser }) => {
  const page = await openVerifier(browser);
  const queue = page.getByTestId("verifier-intake");
  await expect(queue).toContainText("Cocoa");
  await shot(page, "02-verifier-intake");

  const item = queue.locator('[data-testid^="intake-"]').first();
  await item.getByTestId("measured-kg").fill("1000");
  await item.getByTestId("grade").selectOption({ label: "Grade A" });
  await item.getByTestId("evidence-ref").fill("INSP-2026-0001");
  await item.getByTestId("approve").click();
  await expect(queue).toContainText("No deliveries waiting", { timeout: 60_000 });

  const farmer = await openAs(browser, "farmer");
  await signIn(farmer, "farmer");
  await farmer.goto("/stock");
  await expect(farmer.getByTestId("stock")).toContainText("1,000 kg");
  await expect(farmer.getByTestId("stock")).toContainText("Grade A");
  await shot(farmer, "03-farmer-stock");
});

test("3. the farmer gets a first advance with 30 days free, then repays it and gets the crop back", async ({ browser }) => {
  const page = await openAs(browser, "farmer");
  await signIn(page, "farmer");
  await page.goto("/farmer/advance");

  await page.getByTestId("end-date").fill(isoDay(60));
  await expect(page.getByTestId("max-advance")).toContainText("Up to ₦");
  // ₦1,500,000 is $1,000 at the demo rate.
  await page.getByTestId("amount").fill("1500000");
  await expect(page.getByTestId("amount-dollars")).toContainText("$1,000.00");
  // The farmer's first advance: $1,000 starts the demo pool at 5.2% a year, and the welcome fund
  // pays 30 days of that, $4.27, the moment it opens.
  await expect(page.getByTestId("welcome-offer")).toContainText("$4.27");
  await shot(page, "04-advance-form");
  await page.getByTestId("submit-advance").click();
  await confirmed(page, "Take the advance");

  await page.goto("/farmer/loans");
  await expect(page.getByTestId("welcome-credit")).toContainText("$4.27");
  await expect(page.getByTestId("owed")).toContainText("$995.73");
  await shot(page, "05-my-advances");
  // A $1,000 advance repaid on time, after more than two weeks, so it counts on the farmer's record.
  await passMinutes(15 * 24 * 60);
  await page.reload();
  await page.getByTestId("repay-all").click();
  await expect(page.getByTestId("repaid")).toContainText("repaid in full", { timeout: 60_000 });
  await expect(page.getByText("Closed advances")).toBeVisible();

  await page.goto("/farmer");
  await expect(page.getByTestId("credit-on-time")).toContainText("1", { timeout: 30_000 });
  await expect(page.getByTestId("credit-status")).toContainText("2 more on-time repayments");
});

test("4. the farmer lists half with a bulk deal, and a buyer buys 200 kg", async ({ browser }) => {
  const farmer = await openAs(browser, "farmer");
  await signIn(farmer, "farmer");
  await farmer.goto("/market/sell");
  // The page picks the farmer's only lot and offers all of it; then sell half.
  await expect(farmer.getByTestId("lot")).not.toHaveValue("");
  await farmer.locator("#kg").fill("500");
  await farmer.getByTestId("bulk-toggle").check();
  await farmer.locator("#bulk-min").fill("200");
  await farmer.locator("#bulk-off").fill("10");
  await farmer.getByTestId("submit-listing").click();
  await confirmed(farmer, "List for sale");

  const buyer = await openAs(browser, "buyer");
  await signIn(buyer, "buyer");
  await buyer.getByTestId("demo-faucet").click();
  await expect(buyer.getByTestId("usdc-balance")).toContainText("$10,000", { timeout: 60_000 });
  await expect(buyer.getByTestId("listings")).toContainText("10% off from 200 kg");
  await shot(buyer, "06-market");

  await buyer.locator('[data-testid^="buy-"]').first().click();
  const panel = buyer.locator('[data-testid^="buy-panel-"]');
  await panel.locator("input").fill("200");
  await expect(panel.getByText("Bulk deal applied")).toBeVisible();
  await expect(panel.getByTestId("buy-total")).toContainText("$");
  await shot(buyer, "07-buy-panel");
  await panel.getByTestId("confirm-buy").click();
  await expect(buyer.getByTestId("purchase-done")).toContainText("Bought 200 kg", { timeout: 60_000 });

  await buyer.goto("/stock");
  await expect(buyer.getByTestId("stock")).toContainText("200 kg");
});

test("5. the buyer collects; the Safe confirms the goods left the warehouse", async ({ browser }) => {
  const buyer = await openAs(browser, "buyer");
  await signIn(buyer, "buyer");
  await buyer.goto("/stock/collect");
  await expect(buyer.getByTestId("storage-fee")).toContainText("$");
  await buyer.getByTestId("submit-collect").click();
  await confirmed(buyer, "Ask to collect");
  await expect(buyer.getByText("Awaiting warehouse")).toBeVisible();

  const verifier = await openVerifier(browser);
  await verifier.getByTestId("tab-collections").click();
  await verifier.getByRole("button", { name: /goods have left/i }).click();
  await expect(verifier.getByText("No collection requests waiting")).toBeVisible({ timeout: 60_000 });

  await buyer.reload();
  await expect(buyer.getByText("Released")).toBeVisible({ timeout: 30_000 });
});

test("6. an investor invests, then withdraws part", async ({ browser }) => {
  const page = await openAs(browser, "investor");
  await signIn(page, "investor");
  await page.getByTestId("amount-input").fill("1500000");
  await page.getByTestId("submit-tx").click();
  await confirmed(page, "Invest");
  await expect(page.getByTestId("position")).toContainText("₦1,");
  await expect(page.getByTestId("position").locator("..")).toContainText("$1,000");
  await shot(page, "08-investor");

  await page.getByTestId("mode-withdraw").click();
  await page.getByTestId("amount-input").fill("750000");
  await page.getByTestId("submit-tx").click();
  await confirmed(page, "Withdraw");
  await expect(page.getByTestId("position").locator("..")).toContainText("$500");
});

test("7. a price crash puts an advance at risk; the keeper settles half, and the farmer repays the rest", async ({ browser }) => {
  const farmer = await openAs(browser, "farmer");
  await signIn(farmer, "farmer");
  await farmer.goto("/farmer/advance");
  await farmer.getByTestId("end-date").fill(isoDay(60));
  await farmer.getByTestId("amount").fill("1500000");
  await farmer.getByTestId("submit-advance").click();
  await confirmed(farmer, "Take the advance");

  const verifier = await openVerifier(browser);
  await verifier.getByTestId("tab-prices").click();
  // $2.70: the aged 500 kg (about $1,120) are past the 80% point but still cover the debt plus the
  // 5% reward, so half is settled rather than all.
  await verifier.getByTestId("price-1").fill("2.70");
  await verifier.getByTestId("price-1").locator("..").getByRole("button", { name: "Set" }).click();
  await confirmed(verifier, "Set Cocoa");
  // A fall of more than 10% is held: no advance is settled on one update.
  await expect(verifier.getByTestId("held-1")).toContainText("$2.70");
  // Ten minutes on, the Safe confirms it.
  await passMinutes(10);
  await verifier.getByTestId("confirm-1").click({ timeout: 30_000 });
  await confirmed(verifier, "Confirm Cocoa");

  await verifier.getByTestId("tab-advances").click();
  await expect(verifier.getByText("At risk")).toBeVisible({ timeout: 30_000 });
  await shot(verifier, "09-verifier-advances");
  await verifier.getByTestId("run-keeper").click();
  await confirmed(verifier, "Settle with the cushion");

  // Partial settlement: half the $1,000 is repaid from the cushion and the advance carries on.
  await farmer.goto("/farmer/loans");
  await expect(farmer.getByTestId("owed")).toContainText("$500.", { timeout: 30_000 });
  // The farmer repays the rest and gets the cocoa that was not sold back.
  await farmer.getByTestId("repay-all").click();
  await expect(farmer.getByTestId("repaid")).toContainText("repaid in full", { timeout: 60_000 });
});

test("8. the regulator freezes a lot, then unfreezes it", async ({ browser }) => {
  // The Safe gives the regulator role (here straight on the chain, as the Safe would in Safe{Wallet}).
  await rpc("eth_sendTransaction", [
    {
      from: ACCOUNTS.verifier,
      to: deployment!.CommodityRegistry,
      data: encodeFunctionData({
        abi: CommodityRegistryAbi,
        functionName: "grantRole",
        args: [keccak256(toHex("REGULATOR_ROLE")), ACCOUNTS.regulator],
      }),
    },
  ]);

  const page = await openAs(browser, "regulator");
  await signIn(page, "investor");
  await page.goto("/regulator");
  const row = page.locator("tr", { hasText: "Cocoa · lot 1" });
  await row.getByRole("button", { name: "Freeze" }).click();
  await confirmed(page, "Freeze");
  await expect(row).toContainText("Frozen");
  await shot(page, "10-regulator");

  await row.getByRole("button", { name: "Unfreeze" }).click();
  await confirmed(page, "Unfreeze");
  await expect(row.getByRole("button", { name: "Freeze" })).toBeVisible();
});

test("9. expired stock is sold to AgriBridge and listed for feed buyers", async ({ browser }) => {
  // Jump past cocoa's 540-day shelf life.
  await rpc("evm_increaseTime", [541 * 86_400]);
  await rpc("evm_mine", []);

  const verifier = await openVerifier(browser);
  // A fresh price after the jump, and money in the clearance fund.
  await verifier.getByTestId("tab-prices").click();
  await verifier.getByTestId("price-1").fill("5.85");
  await verifier.getByTestId("price-1").locator("..").getByRole("button", { name: "Set" }).click();
  await confirmed(verifier, "Set Cocoa");
  await passMinutes(10);
  await verifier.getByTestId("confirm-1").click({ timeout: 30_000 });
  await confirmed(verifier, "Confirm Cocoa");
  await verifier.getByTestId("tab-clearance").click();
  await verifier.getByLabel("Top up the fund (US$)").fill("5000");
  await verifier.getByRole("button", { name: "Top up" }).click();
  await confirmed(verifier, "Top up the fund");

  const farmer = await openAs(browser, "farmer");
  await signIn(farmer, "farmer");
  await farmer.goto("/market/clearance");
  await expect(farmer.getByTestId("sell-expired")).toBeEnabled({ timeout: 30_000 });
  await shot(farmer, "11-clearance");
  await farmer.getByTestId("sell-expired").click();
  await confirmed(farmer, "Sell to AgriBridge");

  await verifier.reload();
  await verifier.getByTestId("tab-clearance").click();
  await verifier.getByLabel("Price (US$ per kg)").first().fill("1");
  await verifier.getByRole("button", { name: "List" }).first().click();
  await confirmed(verifier, "List for feed buyers");

  await farmer.goto("/market/clearance");
  await expect(farmer.getByText("Feed-grade stock for sale")).toBeVisible();
  await expect(farmer.locator("table")).toContainText("Cocoa");
});

test("10. the Safe adds a warehouse and sees each crop's rules", async ({ browser }) => {
  const verifier = await openVerifier(browser);
  await verifier.getByTestId("tab-warehouses").click();
  await expect(verifier.getByText("Demo Warehouse - Kano").first()).toBeVisible();

  const add = verifier.locator("section", { hasText: "Add a warehouse" });
  await add.getByLabel("Name").fill("Tamale Store");
  await add.getByLabel("Region").fill("Northern, Ghana");
  await add.getByLabel("Capacity (tonnes)").fill("2000");
  await add.getByRole("button", { name: "Add" }).click();
  await confirmed(add, "Add warehouse");
  await expect(verifier.getByText("Tamale Store").first()).toBeVisible();

  await verifier.getByTestId("tab-crops").click();
  await expect(verifier.getByText("Cocoa · crop 1")).toBeVisible();
  await expect(verifier.getByText("Soybeans · crop 6")).toBeVisible();
  await shot(verifier, "13-verifier-crops");
});

test("11. activity tells the story with links to every transaction", async ({ page }) => {
  await page.goto("/activity");
  const feed = page.getByTestId("activity");
  await expect(feed).toContainText("booked a delivery", { timeout: 30_000 });
  await expect(feed).toContainText("The warehouse verified lot 1");
  await expect(feed).toContainText("bought 200 kg");
  await expect(feed).toContainText("settled by selling");
  await expect(feed).toContainText("was held for confirmation");
  await shot(page, "12-activity");
});

test("12. in an emergency the Safe pauses prices, overrides one, then resumes", async ({ browser }) => {
  const verifier = await openVerifier(browser);
  await verifier.getByTestId("tab-prices").click();
  // Cashew is priced by local reporters: while prices run, the Safe can't set it.
  await expect(verifier.getByTestId("price-4-reporters")).toBeVisible();
  await expect(verifier.getByTestId("price-4")).toHaveCount(0);

  await verifier.getByTestId("price-brake").click();
  await confirmed(verifier, "Pause prices");
  await expect(verifier.getByTestId("prices-paused")).toBeVisible();
  await verifier.getByTestId("price-4").fill("3.10");
  await verifier.getByTestId("price-4").locator("..").getByRole("button", { name: "Override" }).click();
  await confirmed(verifier, "Override Cashew");

  // Prices stay paused for an hour after an override, so borrowers can react first.
  await expect(verifier.getByTestId("price-brake")).toBeDisabled();
  await passMinutes(61);
  await expect(verifier.getByTestId("price-brake")).toBeEnabled({ timeout: 30_000 });
  await verifier.getByTestId("price-brake").click();
  await confirmed(verifier, "Resume prices");
  await expect(verifier.getByTestId("prices-paused")).toHaveCount(0);
  await expect(verifier.locator("tr", { hasText: "Cashew" })).toContainText("$3.10");

  // The brake is public: anyone can see it was used.
  await verifier.goto("/activity");
  await expect(verifier.getByTestId("activity")).toContainText("Prices were paused", { timeout: 30_000 });
});

/** The farmer books 1,000 kg of cashew and the Safe grades it A: a fresh lot to sell or borrow against. */
async function freshCashewLot(browser: Browser, inspection: string): Promise<Page> {
  const farmer = await openAs(browser, "farmer");
  await signIn(farmer, "farmer");
  await farmer.goto("/farmer/deliver");
  await farmer.getByTestId("commodity").selectOption({ label: "Cashew" });
  await farmer.getByTestId("warehouse").selectOption({ index: 1 });
  await farmer.getByTestId("quantity").fill("1000");
  await farmer.getByTestId("harvest-date").fill(isoDay(0));
  await farmer.getByTestId("submit-delivery").click();
  await confirmed(farmer, "Book the delivery");

  const verifier = await openVerifier(browser);
  const queue = verifier.getByTestId("verifier-intake");
  await expect(queue).toContainText("Cashew", { timeout: 30_000 });
  const item = queue.locator('[data-testid^="intake-"]').first();
  await item.getByTestId("measured-kg").fill("1000");
  await item.getByTestId("grade").selectOption({ label: "Grade A" });
  await item.getByTestId("evidence-ref").fill(inspection);
  await item.getByTestId("approve").click();
  await expect(queue).toContainText("No deliveries waiting", { timeout: 60_000 });
  await verifier.close();
  return farmer;
}

/** The buyer takes `amount` kg of the cashew for sale and waits for the purchase to land. */
async function buyCashew(buyer: Page, amount: string, expected: string) {
  await buyer.goto("/market");
  const row = buyer.locator("tr", { hasText: "Cashew" }).first();
  await row.locator('[data-testid^="buy-"]').click();
  const panel = buyer.locator('[data-testid^="buy-panel-"]');
  await panel.locator("input").fill(amount);
  await expect(panel.getByTestId("buy-total")).toContainText("$");
  await panel.getByTestId("confirm-buy").click();
  await expect(buyer.getByTestId("purchase-done")).toContainText(`Bought ${expected}`, { timeout: 60_000 });
}

test("13. get paid today: the farmer lists cashew and takes an advance; each sale repays its share", async ({ browser }) => {
  const farmer = await freshCashewLot(browser, "INSP-2026-0013");
  await farmer.goto("/market/sell");
  const option = farmer.getByTestId("lot").locator("option", { hasText: "Cashew" }).first();
  await farmer.getByTestId("lot").selectOption((await option.getAttribute("value")) ?? "");
  await farmer.locator("#kg").fill("1000");
  await farmer.getByTestId("pricing-fixed").click();
  // ₦5,100 a kilogram is $3.40.
  await farmer.locator("#fixed").fill("5100");
  await farmer.getByTestId("advance-toggle").check();
  await expect(farmer.getByTestId("advance-limit")).toContainText("Up to ₦", { timeout: 30_000 });
  await farmer.getByTestId("advance-amount").fill("1500000");
  // ₦1,500,000 ($1,000) across 1,000 kg, with 10% to spare: ₦1,650 ($1.10) a kilogram.
  await expect(farmer.getByTestId("advance-min-price")).toContainText("₦1,650/kg");
  await expect(farmer.getByTestId("advance-min-price")).toContainText("$1.10");
  await expect(farmer.getByTestId("advance-summary")).toContainText("$3,400");
  await shot(farmer, "13-get-paid-today");
  await farmer.getByTestId("submit-listing").click();
  await confirmed(farmer, "List and get paid today");

  await farmer.goto("/farmer/loans");
  await expect(farmer.getByTestId("advance-listed")).toBeVisible({ timeout: 30_000 });
  await expect(farmer.getByTestId("owed")).toContainText("$1,000");

  // Half sells: $1,700 plus the $17 fee. Half the advance is repaid out of it.
  const buyer = await openAs(browser, "buyer");
  await signIn(buyer, "buyer");
  await buyer.goto("/market");
  const row = buyer.locator("tr", { hasText: "Cashew" }).first();
  await row.locator('[data-testid^="buy-"]').click();
  const panel = buyer.locator('[data-testid^="buy-panel-"]');
  await panel.locator("input").fill("500");
  await expect(panel.getByTestId("buy-fee")).toContainText("$17.00");
  await expect(panel.getByTestId("buy-total")).toContainText("$1,717.00");
  await panel.getByTestId("confirm-buy").click();
  await expect(buyer.getByTestId("purchase-done")).toContainText("Bought 500 kg", { timeout: 60_000 });

  await farmer.reload();
  await expect(farmer.getByTestId("owed")).toContainText("$500.", { timeout: 30_000 });

  // The rest sells, and the advance is repaid in full.
  await buyCashew(buyer, "500", "500 kg");
  await farmer.reload();
  await expect(farmer.getByTestId("owed")).toHaveCount(0, { timeout: 30_000 });

  // Investors got half of each fee.
  const investor = await openAs(browser, "investor");
  await signIn(investor, "investor");
  await investor.goto("/investor");
  await expect(investor.getByTestId("fee-income")).not.toContainText("$0.00", { timeout: 30_000 });
});

test("14. the advance at the gate: cash on delivery, then the crop sells at the farmer's price to repay it", async ({ browser }) => {
  const farmer = await freshCashewLot(browser, "INSP-2026-0014");
  await farmer.goto("/farmer");
  await expect(farmer.getByTestId("sell-or-wait")).toBeVisible({ timeout: 30_000 });
  await expect(farmer.getByTestId("break-even")).toContainText(/Needs prices up|Pays even/);
  await expect(farmer.getByTestId("gate-amount")).toContainText("Take up to ₦", { timeout: 30_000 });
  await expect(farmer.getByTestId("gate-dollars")).toContainText("$");
  await shot(farmer, "14-gate-offer");
  await farmer.getByTestId("gate-take").click();
  await confirmed(farmer, "Take the advance");

  await farmer.goto("/farmer/loans");
  await farmer.getByTestId("sell-to-repay").click();
  await expect(farmer.getByTestId("sell-advance-crop")).toBeVisible({ timeout: 30_000 });
  await expect(farmer.getByTestId("advance-min-price")).toContainText("$");
  // Follow the market at 100% of today's value.
  await farmer.getByTestId("submit-advance-listing").click();
  await confirmed(farmer, "List the advance's crop");

  const buyer = await openAs(browser, "buyer");
  await signIn(buyer, "buyer");
  const before = await buyer.getByTestId("usdc-balance").innerText();
  await buyer.getByTestId("demo-faucet").click();
  await expect(buyer.getByTestId("usdc-balance")).not.toHaveText(before, { timeout: 60_000 });
  await buyCashew(buyer, "1000", "1,000 kg");

  await farmer.goto("/farmer/loans");
  await expect(farmer.getByTestId("owed")).toHaveCount(0, { timeout: 30_000 });
});

/** Balances on the local chain, read directly: USDC (6 decimals) and ETH (wei). */
async function usdcOf(account: string): Promise<bigint> {
  const data = encodeFunctionData({ abi: ERC20Abi, functionName: "balanceOf", args: [account as `0x${string}`] });
  return BigInt((await rpc("eth_call", [{ to: deployment!.DemoUSDC, data }, "latest"])) as string);
}

async function ethOf(account: string): Promise<bigint> {
  return BigInt((await rpc("eth_getBalance", [account, "latest"])) as string);
}

test("15. the wallet page: receive at an address or QR code, and send dollars and ETH to anyone", async ({ browser }) => {
  const farmer = await openAs(browser, "farmer");
  await signIn(farmer, "farmer");
  await farmer.goto("/wallet");
  // The address in groups of four, easy to read out, and as a QR code.
  await expect(farmer.getByTestId("wallet-address")).toContainText("0x7099 7970 C518 12dc");
  await expect(farmer.getByTestId("wallet-qr").locator("svg path")).toBeVisible();
  await expect(farmer.getByTestId("hold-eth")).toContainText("ETH");
  // A MetaMask wallet already lives in MetaMask: nothing to move.
  await farmer.getByTestId("export-open").click();
  await expect(farmer.getByTestId("export-not-needed")).toBeVisible();

  // Money sent straight to an AgriBridge contract would be lost, so it is refused.
  await farmer.getByTestId("send-to").fill(deployment!.LendingPool);
  await farmer.getByTestId("send-amount").fill("15000");
  await farmer.getByTestId("send-check").click();
  await expect(farmer.getByTestId("form-error")).toContainText("AgriBridge contract");

  // ₦15,000 is $10 at the demo rate, and the buyer receives exactly that.
  const usdcBefore = await usdcOf(ACCOUNTS.buyer);
  await farmer.getByTestId("send-to").fill(ACCOUNTS.buyer);
  await expect(farmer.getByTestId("send-amount-hint")).toContainText("That is $10.00");
  await farmer.getByTestId("send-check").click();
  await expect(farmer.getByTestId("send-review-to")).toContainText("0x90F7 9bf6 EB2c");
  // "Change" goes back to the form with everything still filled in.
  await farmer.getByRole("button", { name: "Change" }).click();
  await expect(farmer.getByTestId("send-to")).toHaveValue(ACCOUNTS.buyer);
  await expect(farmer.getByTestId("send-amount")).toHaveValue("15000");
  await farmer.getByTestId("send-check").click();
  await shot(farmer, "15-wallet-check");
  await farmer.getByTestId("send-confirm").click();
  await confirmed(farmer, "Send dollars");
  // Confirmed: the check panel goes at once, so the same payment can't be sent twice.
  await expect(farmer.getByTestId("send-review")).toHaveCount(0);
  await expect(farmer.getByTestId("tx-status")).toContainText("Sent ₦15,000 ($10.00)");
  expect(await usdcOf(ACCOUNTS.buyer)).toBe(usdcBefore + 10_000_000n);

  // And 0.05 ETH, for the buyer's network fees.
  const ethBefore = await ethOf(ACCOUNTS.buyer);
  await farmer.getByTestId("send-asset-eth").click();
  await farmer.getByTestId("send-to").fill(ACCOUNTS.buyer);
  await farmer.getByTestId("send-amount").fill("0.05");
  await farmer.getByTestId("send-check").click();
  await farmer.getByTestId("send-confirm").click();
  await confirmed(farmer, "Send ETH");
  await expect(farmer.getByTestId("tx-status")).toContainText("Sent 0.05 ETH");
  expect(await ethOf(ACCOUNTS.buyer)).toBe(ethBefore + 50_000_000_000_000_000n);
  await shot(farmer, "15-wallet");
});
