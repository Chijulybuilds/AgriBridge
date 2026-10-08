import { test, expect, type Browser, type Page } from "@playwright/test";
import { encodeFunctionData, keccak256, toHex } from "viem";

import { CommodityRegistryAbi } from "../lib/contracts/abis";
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

test("3. the farmer gets an advance, then repays it and gets the crop back", async ({ browser }) => {
  const page = await openAs(browser, "farmer");
  await signIn(page, "farmer");
  await page.goto("/farmer/advance");

  await page.getByTestId("end-date").fill(isoDay(60));
  await expect(page.getByTestId("max-advance")).toContainText("Up to $");
  await page.getByTestId("amount").fill("1000");
  await shot(page, "04-advance-form");
  await page.getByTestId("submit-advance").click();
  await confirmed(page, "Take the advance");

  await page.goto("/farmer/loans");
  await expect(page.getByTestId("owed")).toContainText("$1,000");
  await shot(page, "05-my-advances");
  await page.getByTestId("repay-all").click();
  await expect(page.getByTestId("repaid")).toContainText("repaid in full", { timeout: 60_000 });
  await expect(page.getByText("Closed advances")).toBeVisible();
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
  await page.getByTestId("amount-input").fill("1000");
  await page.getByTestId("submit-tx").click();
  await confirmed(page, "Invest");
  await expect(page.getByTestId("position")).toContainText("$1,000");
  await shot(page, "08-investor");

  await page.getByTestId("mode-withdraw").click();
  await page.getByTestId("amount-input").fill("500");
  await page.getByTestId("submit-tx").click();
  await confirmed(page, "Withdraw");
  await expect(page.getByTestId("position")).toContainText("$500");
});

test("7. a price crash puts an advance at risk; the keeper settles it from the cushion", async ({ browser }) => {
  const farmer = await openAs(browser, "farmer");
  await signIn(farmer, "farmer");
  await farmer.goto("/farmer/advance");
  await farmer.getByTestId("end-date").fill(isoDay(60));
  await farmer.getByTestId("amount").fill("1000");
  await farmer.getByTestId("submit-advance").click();
  await confirmed(farmer, "Take the advance");

  const verifier = await openVerifier(browser);
  await verifier.getByTestId("tab-prices").click();
  await verifier.getByTestId("price-1").fill("2.50");
  await verifier.getByTestId("price-1").locator("..").getByRole("button", { name: "Set" }).click();
  await confirmed(verifier, "Set Cocoa");

  await verifier.getByTestId("tab-advances").click();
  await expect(verifier.getByText("At risk")).toBeVisible({ timeout: 30_000 });
  await shot(verifier, "09-verifier-advances");
  await verifier.getByTestId("run-keeper").click();
  await confirmed(verifier, "Settle with the cushion");

  await farmer.goto("/farmer/loans");
  await expect(farmer.getByText("Liquidated")).toBeVisible({ timeout: 30_000 });
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
  await shot(page, "12-activity");
});
