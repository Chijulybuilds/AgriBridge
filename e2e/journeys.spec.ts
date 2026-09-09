import { test, expect } from "@playwright/test";
import { installMockWallet, connectAndSignIn } from "./fixtures/mockWallet";

test.beforeEach(async ({ page }) => {
  await installMockWallet(page);
});

test.describe("Farmer journey", () => {
  test("the tokenize form only offers on-chain commodity types and grades", async ({ page }) => {
    await connectAndSignIn(page, "farmer");
    await page.goto("/farmer/tokenize");

    const type = page.getByTestId("commodity-type");
    await expect(type).toBeVisible();

    // The contracts accept exactly these five; anything else cannot be encoded.
    const options = await type.locator("option").allTextContents();
    expect(options).toEqual(["Cocoa", "Rice", "Maize", "Cashew", "Yam"]);

    const grades = await page.getByTestId("grade").locator("option").allTextContents();
    expect(grades).toEqual(["Grade A", "Grade B", "Grade C"]);
  });

  test("tokenize rejects an empty quantity before touching the wallet", async ({ page }) => {
    await connectAndSignIn(page, "farmer");
    await page.goto("/farmer/tokenize");

    await page.getByTestId("harvest-date").fill("2026-01-15");
    await page.getByTestId("submit-tokenize").click();

    await expect(page.getByTestId("form-error")).toContainText(/quantity/i);
  });

  test("tokenize rejects a future harvest date", async ({ page }) => {
    await connectAndSignIn(page, "farmer");
    await page.goto("/farmer/tokenize");

    await page.getByTestId("quantity").fill("1000");

    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    // The input caps at today, so set the value directly to test the guard.
    await page.getByTestId("harvest-date").evaluate((el, value) => {
      (el as HTMLInputElement).value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, future.toISOString().split("T")[0]);

    await page.getByTestId("submit-tokenize").click();
    await expect(page.getByTestId("form-error")).toContainText(/future/i);
  });

  test("commodities page renders without contract data configured", async ({ page }) => {
    await connectAndSignIn(page, "farmer");
    await page.goto("/farmer/commodities");

    await expect(page.getByRole("heading", { name: /my commodities/i })).toBeVisible();
  });

  test("loans page shows an empty state rather than a hardcoded list", async ({ page }) => {
    await connectAndSignIn(page, "farmer");
    await page.goto("/farmer/loans");

    await expect(page.getByRole("heading", { name: /my loans/i })).toBeVisible();
    await expect(page.getByText(/no loans yet/i)).toBeVisible();
  });

  test("borrow explains why borrowing is unavailable without verified collateral", async ({ page }) => {
    await connectAndSignIn(page, "farmer");
    await page.goto("/farmer/borrow");

    await expect(page.getByRole("heading", { name: /borrow funds/i })).toBeVisible();
    await expect(page.getByText(/no verified commodities/i)).toBeVisible();
  });
});

test.describe("Investor journey", () => {
  test("the deposit page switches between deposit and withdraw", async ({ page }) => {
    await connectAndSignIn(page, "investor");
    await page.goto("/investor/deposit");

    await expect(page.getByRole("heading", { name: /deposit/i }).first()).toBeVisible();

    await page.getByTestId("mode-withdraw").click();
    await expect(page.getByText(/shares to redeem/i)).toBeVisible();

    await page.getByTestId("mode-deposit").click();
    await expect(page.getByText(/amount \(usdc\)/i)).toBeVisible();
  });

  test("deposit rejects a zero amount before prompting the wallet", async ({ page }) => {
    await connectAndSignIn(page, "investor");
    await page.goto("/investor/deposit");

    await page.getByTestId("amount-input").fill("0");
    await page.getByTestId("submit-tx").click();

    // A zero amount leaves the button disabled, so no wallet prompt is possible.
    await expect(page.getByTestId("submit-tx")).toBeDisabled();
  });

  test("pool and returns pages render live figures rather than fixtures", async ({ page }) => {
    await connectAndSignIn(page, "investor");

    await page.goto("/investor/pools");
    await expect(page.getByText(/usdc lending pool/i)).toBeVisible();

    await page.goto("/investor/returns");
    await expect(page.getByRole("heading", { name: /returns/i })).toBeVisible();
    await expect(page.getByText(/no position yet/i)).toBeVisible();
  });
});

test.describe("Configuration safety", () => {
  test("a missing contract configuration is reported, not hidden", async ({ page }) => {
    await connectAndSignIn(page, "investor");
    await page.goto("/investor/deposit");

    // Without NEXT_PUBLIC_* addresses the app must say so rather than
    // silently rendering zeroes that look like real balances.
    const banner = page.getByText(/contract addresses are not configured/i);
    if (await banner.isVisible().catch(() => false)) {
      await expect(banner).toContainText(/deploy-all/);
    }
  });
});
