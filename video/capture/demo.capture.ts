import fs from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";

import { installMockWallet, rpc, signIn, type AccountName } from "../../e2e/fixtures/mockWallet";

/**
 * Walks the AgriBridge story once, on a local chain, and saves each screen the demo video shows:
 * a 2× screenshot plus the box of every element the video's cursor or zoom points at.
 * Output: video/public/shots/<name>.png and video/public/shots/manifest.json.
 */
const OUT = path.join(__dirname, "..", "public", "shots");
type Box = { x: number; y: number; w: number; h: number };
const manifest: Record<string, { url: string; targets: Record<string, Box> }> = {};

const isoDay = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** Hides the dev server's badge and waits for the page to settle before a shot. */
async function settle(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal{display:none!important} *{caret-color:transparent!important}" });
  await page.waitForTimeout(1200);
}

/** Saves a viewport screenshot and the boxes of the given elements (CSS pixels, viewport-relative). */
async function snap(page: Page, name: string, targets: Record<string, Locator> = {}) {
  const first = Object.values(targets)[0];
  if (first) await first.scrollIntoViewIfNeeded();
  await settle(page);
  const boxes: Record<string, Box> = {};
  for (const [key, locator] of Object.entries(targets)) {
    const b = await locator.first().boundingBox();
    if (b) boxes[key] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  }
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  manifest[name] = { url: new URL(page.url()).pathname, targets: boxes };
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
}

async function confirmed(scope: Page | Locator, step: string) {
  const ofStep = `[data-testid="tx-status"][data-step="${step}"]`;
  const done = scope.locator(`${ofStep}[data-status="confirmed"]`);
  const failed = scope.locator(`${ofStep}[data-status="failed"]`);
  await expect(done.or(failed).first()).toBeVisible({ timeout: 60_000 });
  if ((await failed.count()) > 0) throw new Error(`"${step}" failed: ${await failed.first().innerText()}`);
}

async function openAs(browser: Browser, account: AccountName): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
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

/** Reloads the verifier console; it usually reconnects by itself, otherwise connect again. */
async function reopenVerifier(page: Page) {
  await page.reload();
  const connect = page.getByTestId("verifier-connect").filter({ hasText: "Mock Wallet" });
  await expect(page.getByTestId("verifier-safe").or(connect).first()).toBeVisible({ timeout: 30_000 });
  if (await connect.isVisible()) await connect.click();
  await expect(page.getByTestId("verifier-safe")).toBeVisible({ timeout: 30_000 });
}

test("capture the demo screens", async ({ browser }) => {
  fs.mkdirSync(OUT, { recursive: true });

  // 3. Signing in
  const farmer = await openAs(browser, "farmer");
  await farmer.goto("/login?role=farmer");
  await expect(farmer.getByTestId("connect-wallet")).toBeVisible();
  await snap(farmer, "03-login", { connect: farmer.getByTestId("connect-wallet"), roles: farmer.locator("fieldset") });
  await farmer.getByTestId("connect-wallet").click();
  await farmer.waitForURL(/\/farmer$/);
  await snap(farmer, "03-farmer-home", { stats: farmer.locator(".grid-4").first() });

  // 4. A farmer books a delivery
  await farmer.goto("/farmer/deliver");
  await farmer.getByTestId("commodity").selectOption({ label: "Cocoa" });
  await farmer.getByTestId("warehouse").selectOption({ index: 1 });
  await farmer.getByTestId("quantity").fill("1000");
  await farmer.getByTestId("harvest-date").fill(isoDay(0));
  await snap(farmer, "04-deliver-form", {
    commodity: farmer.getByTestId("commodity"),
    warehouse: farmer.getByTestId("warehouse"),
    quantity: farmer.getByTestId("quantity"),
    submit: farmer.getByTestId("submit-delivery"),
  });
  await farmer.getByTestId("submit-delivery").click();
  await confirmed(farmer, "Book the delivery");
  await expect(farmer.getByTestId("deliveries")).toContainText("Pending");
  await snap(farmer, "04-deliver-done", { status: farmer.getByTestId("tx-status"), deliveries: farmer.getByTestId("deliveries") });

  // 5. The warehouse verifies it
  const verifier = await openVerifier(browser);
  const queue = verifier.getByTestId("verifier-intake");
  await expect(queue).toContainText("Cocoa");
  const item = queue.locator('[data-testid^="intake-"]').first();
  await item.getByTestId("measured-kg").fill("1000");
  await item.getByTestId("grade").selectOption({ label: "Grade A" });
  await item.getByTestId("evidence-ref").fill("INSP-2026-0001");
  await snap(verifier, "05-verify-form", {
    item,
    measured: item.getByTestId("measured-kg"),
    grade: item.getByTestId("grade"),
    evidence: item.getByTestId("evidence-ref"),
    approve: item.getByTestId("approve"),
  });
  await item.getByTestId("approve").click();
  await expect(queue).toContainText("No deliveries waiting", { timeout: 60_000 });
  await snap(verifier, "05-verify-done", { status: verifier.getByTestId("tx-status") });

  // 6. Crop tokens in the farmer's stock
  await farmer.goto("/stock");
  await expect(farmer.getByTestId("stock")).toContainText("1,000 kg");
  await snap(farmer, "06-stock", { stats: farmer.locator(".grid-4").first(), stock: farmer.getByTestId("stock") });
  const timelineToggle = farmer.getByRole("button", { name: /value|worth|timeline|details/i }).first();
  if (await timelineToggle.isVisible().catch(() => false)) {
    await timelineToggle.click();
    await expect(farmer.locator(".timeline").first()).toBeVisible();
    await snap(farmer, "06-stock-timeline", { timeline: farmer.locator(".timeline").first() });
  }

  // 7. A cash advance
  await farmer.goto("/farmer/advance");
  await farmer.getByTestId("end-date").fill(isoDay(60));
  await expect(farmer.getByTestId("max-advance")).toContainText("Up to $");
  await farmer.getByTestId("amount").fill("1000");
  await snap(farmer, "07-advance-form", {
    endDate: farmer.getByTestId("end-date"),
    max: farmer.getByTestId("max-advance"),
    amount: farmer.getByTestId("amount"),
    submit: farmer.getByTestId("submit-advance"),
  });
  await farmer.getByTestId("submit-advance").click();
  await confirmed(farmer, "Take the advance");
  await snap(farmer, "07-advance-done", { status: farmer.getByTestId("tx-status") });
  await farmer.goto("/farmer/loans");
  await expect(farmer.getByTestId("owed")).toContainText("$1,000");
  await snap(farmer, "07-loans", { owed: farmer.getByTestId("owed"), repay: farmer.getByTestId("repay-all") });
  await farmer.getByTestId("repay-all").click();
  await expect(farmer.getByTestId("repaid")).toContainText("repaid in full", { timeout: 60_000 });
  await snap(farmer, "07-repaid", { repaid: farmer.getByTestId("repaid") });

  // 8. Selling on the market
  await farmer.goto("/market/sell");
  await expect(farmer.getByTestId("lot")).not.toHaveValue("");
  await farmer.locator("#kg").fill("500");
  await farmer.getByTestId("bulk-toggle").check();
  await farmer.locator("#bulk-min").fill("200");
  await farmer.locator("#bulk-off").fill("10");
  await snap(farmer, "08-sell-form", {
    kg: farmer.locator("#kg"),
    bulk: farmer.getByTestId("bulk-toggle"),
    bulkOff: farmer.locator("#bulk-off"),
    submit: farmer.getByTestId("submit-listing"),
  });
  await farmer.getByTestId("submit-listing").click();
  await confirmed(farmer, "List for sale");

  // 9. A buyer buys and collects
  const buyer = await openAs(browser, "buyer");
  await signIn(buyer, "buyer");
  await buyer.getByTestId("demo-faucet").click();
  await expect(buyer.getByTestId("usdc-balance")).toContainText("$10,000", { timeout: 60_000 });
  await buyer.goto("/market");
  await expect(buyer.getByTestId("listings")).toContainText("10% off from 200 kg");
  await buyer.waitForTimeout(2500); // let the overview finish its count-up and bars
  await snap(buyer, "08-market-overview", {
    hero: buyer.getByTestId("market-overview"),
    chart: buyer.locator(".crop-chart"),
    warehouses: buyer.locator(".fill-list"),
  });
  await snap(buyer, "09-market-listings", { listings: buyer.getByTestId("listings"), buy: buyer.locator('[data-testid^="buy-"]').first() });
  await buyer.locator('[data-testid^="buy-"]').first().click();
  const panel = buyer.locator('[data-testid^="buy-panel-"]');
  await panel.locator("input").fill("200");
  await expect(panel.getByText("Bulk deal applied")).toBeVisible();
  await snap(buyer, "09-buy-panel", { panel, total: panel.getByTestId("buy-total"), confirm: panel.getByTestId("confirm-buy") });
  await panel.getByTestId("confirm-buy").click();
  await expect(buyer.getByTestId("purchase-done")).toContainText("Bought 200 kg", { timeout: 60_000 });
  await snap(buyer, "09-bought", { done: buyer.getByTestId("purchase-done") });

  await buyer.goto("/stock/collect");
  await expect(buyer.getByTestId("storage-fee")).toContainText("$");
  await snap(buyer, "09-collect-form", { fee: buyer.getByTestId("storage-fee"), submit: buyer.getByTestId("submit-collect") });
  await buyer.getByTestId("submit-collect").click();
  await confirmed(buyer, "Ask to collect");
  await expect(buyer.getByText("Awaiting warehouse")).toBeVisible();
  await reopenVerifier(verifier);
  await verifier.getByTestId("tab-collections").click();
  const left = verifier.getByRole("button", { name: /goods have left/i });
  await snap(verifier, "09-verify-collection", { confirm: left });
  await left.click();
  await expect(verifier.getByText("No collection requests waiting")).toBeVisible({ timeout: 60_000 });
  await buyer.reload();
  await expect(buyer.getByText("Released")).toBeVisible({ timeout: 30_000 });
  await snap(buyer, "09-released", { released: buyer.getByText("Released").first() });

  // 10. The investor
  const investor = await openAs(browser, "investor");
  await signIn(investor, "investor");
  await investor.getByTestId("amount-input").fill("1000");
  await snap(investor, "10-invest-form", { amount: investor.getByTestId("amount-input"), submit: investor.getByTestId("submit-tx") });
  await investor.getByTestId("submit-tx").click();
  await confirmed(investor, "Invest");
  await expect(investor.getByTestId("position")).toContainText("$1,000");
  await investor.waitForTimeout(1500);
  await snap(investor, "10-invested", { stats: investor.locator(".grid-4").first(), position: investor.getByTestId("position") });

  // 11. When prices fall
  await farmer.goto("/farmer/advance");
  await farmer.getByTestId("end-date").fill(isoDay(60));
  await farmer.getByTestId("amount").fill("1000");
  await farmer.getByTestId("submit-advance").click();
  await confirmed(farmer, "Take the advance");
  await verifier.getByTestId("tab-prices").click();
  await verifier.getByTestId("price-1").fill("2.50");
  await snap(verifier, "11-price-crash", { price: verifier.getByTestId("price-1") });
  await verifier.getByTestId("price-1").locator("..").getByRole("button", { name: "Set" }).click();
  await confirmed(verifier, "Set Cocoa");
  await verifier.getByTestId("tab-advances").click();
  await expect(verifier.getByText("At risk")).toBeVisible({ timeout: 30_000 });
  await verifier.waitForTimeout(1200);
  await snap(verifier, "11-at-risk", { atRisk: verifier.getByText("At risk").first(), keeper: verifier.getByTestId("run-keeper") });
  await verifier.getByTestId("run-keeper").click();
  await confirmed(verifier, "Settle with the cushion");
  await farmer.goto("/farmer/loans");
  await expect(farmer.getByText("Liquidated")).toBeVisible({ timeout: 30_000 });
  await snap(farmer, "11-settled", { settled: farmer.getByText("Liquidated").first() });

  // 12. Expired stock (jump past cocoa's 540-day shelf life)
  await rpc("evm_increaseTime", [541 * 86_400]);
  await rpc("evm_mine", []);
  await verifier.getByTestId("tab-prices").click();
  await verifier.getByTestId("price-1").fill("5.85");
  await verifier.getByTestId("price-1").locator("..").getByRole("button", { name: "Set" }).click();
  await confirmed(verifier, "Set Cocoa");
  await verifier.getByTestId("tab-clearance").click();
  await verifier.getByLabel("Top up the fund (US$)").fill("5000");
  await verifier.getByRole("button", { name: "Top up" }).click();
  await confirmed(verifier, "Top up the fund");
  await farmer.goto("/market/clearance");
  await expect(farmer.getByTestId("sell-expired")).toBeEnabled({ timeout: 30_000 });
  await snap(farmer, "12-clearance", { sell: farmer.getByTestId("sell-expired") });
  await farmer.getByTestId("sell-expired").click();
  await confirmed(farmer, "Sell to AgriBridge");
  await reopenVerifier(verifier);
  await verifier.getByTestId("tab-clearance").click();
  await verifier.getByLabel("Price (US$ per kg)").first().fill("1");
  await verifier.getByRole("button", { name: "List" }).first().click();
  await confirmed(verifier, "List for feed buyers");
  await farmer.goto("/market/clearance");
  await expect(farmer.getByText("Feed-grade stock for sale")).toBeVisible();
  await snap(farmer, "12-feed-listing", { listing: farmer.getByText("Feed-grade stock for sale") });

  // 13. Every step on the record
  await farmer.goto("/activity");
  await expect(farmer.getByTestId("activity")).toContainText("The warehouse verified lot 1", { timeout: 30_000 });
  await snap(farmer, "13-activity", { feed: farmer.getByTestId("activity") });
});
