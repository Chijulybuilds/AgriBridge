import { test, expect } from "@playwright/test";

import { installMockWallet, signIn } from "./fixtures/mockWallet";

test.describe("Landing page", () => {
  test("presents the product and routes each role to sign-in", async ({ page }) => {
    await installMockWallet(page);
    await page.goto("/");
    await expect(page).toHaveTitle(/agribridge/i);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.getByText(/no crypto wallet needed/i).first()).toBeVisible();

    await page.getByRole("link", { name: /i'm a farmer/i }).click();
    await expect(page).toHaveURL(/\/login\?role=farmer/);
  });

  test("shows no invented figures", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("$2.4M")).toHaveCount(0);
    await expect(page.getByText(/join thousands/i)).toHaveCount(0);
  });
});

test.describe("Signing in", () => {
  const signedInPages = [
    "/farmer",
    "/farmer/deliver",
    "/farmer/advance",
    "/farmer/loans",
    "/stock",
    "/stock/collect",
    "/market/sell",
    "/investor",
    "/investor/risk",
    "/regulator",
  ];

  for (const path of signedInPages) {
    test(`${path} sends a visitor who isn't signed in to sign-in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/, { timeout: 20_000 });
    });
  }

  test("the market and activity are open to everyone", async ({ page }) => {
    await page.goto("/market");
    await expect(page.getByRole("heading", { name: "Market" })).toBeVisible();
    await expect(page).toHaveURL(/\/market$/);
    await page.goto("/activity");
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  });

  test("a farmer signs in with a wallet and lands on their overview", async ({ page }) => {
    await installMockWallet(page, "farmer");
    await signIn(page, "farmer");
    await expect(page.getByRole("heading", { name: /farmer overview/i })).toBeVisible();
  });

  test("an investor lands on the investor overview, and can switch role", async ({ page }) => {
    await installMockWallet(page, "investor");
    await signIn(page, "investor");
    await expect(page.getByRole("heading", { name: /investor overview/i })).toBeVisible();
    // The sidebar exists twice (desktop and mobile); use the one on screen.
    await page.getByTestId("switch-to-buyer").filter({ visible: true }).click();
    await expect(page.getByRole("heading", { name: "Market" })).toBeVisible();
  });

  test("sign-in returns people to the page they asked for", async ({ page }) => {
    await installMockWallet(page, "farmer");
    await page.goto("/stock");
    await page.waitForURL(/\/login\?next=/);
    await page.getByTestId("connect-wallet").first().click();
    await expect(page).toHaveURL(/\/stock$/);
  });
});

test.describe("The verifier page", () => {
  test("is not linked from the public app", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('a[href*="verifier"]')).toHaveCount(0);
    await page.goto("/market");
    await expect(page.locator('a[href*="verifier"]')).toHaveCount(0);
  });

  test("is kept out of search engines", async ({ page }) => {
    await page.goto("/verifier");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("looks like a missing page to any wallet but the Safe", async ({ page }) => {
    await installMockWallet(page, "farmer");
    await page.goto("/verifier");
    await page.getByTestId("verifier-connect").first().click();
    await expect(page.getByTestId("not-found")).toBeVisible();
    await expect(page.getByText(/intake/i)).toHaveCount(0);
  });
});
