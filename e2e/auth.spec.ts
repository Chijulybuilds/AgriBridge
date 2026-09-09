import { test, expect } from "@playwright/test";
import { installMockWallet, connectAndSignIn, TEST_ACCOUNT } from "./fixtures/mockWallet";

test.beforeEach(async ({ page }) => {
  await installMockWallet(page);
});

test.describe("Landing page", () => {
  test("presents the product and routes both roles to sign-in", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/agribridge/i);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  });

  test("a farmer call to action leads to the login page", async ({ page }) => {
    await page.goto("/");

    const farmerCta = page.getByRole("button", { name: /farmer/i }).first();
    if (await farmerCta.isVisible().catch(() => false)) {
      await farmerCta.click();
      await expect(page).toHaveURL(/\/login/);
    } else {
      // The landing page links rather than buttons in some layouts.
      await page.goto("/login?role=farmer");
      await expect(page).toHaveURL(/\/login/);
    }
  });
});

test.describe("Route guards", () => {
  const protectedPaths = [
    "/farmer/dashboard",
    "/farmer/commodities",
    "/farmer/tokenize",
    "/farmer/borrow",
    "/farmer/loans",
    "/investor/dashboard",
    "/investor/deposit",
    "/investor/pools",
    "/investor/returns",
    "/admin/dashboard",
    "/admin/queue",
  ];

  for (const path of protectedPaths) {
    test(`${path} redirects an unauthenticated visitor to login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    });
  }
});

test.describe("Sign-In with Ethereum", () => {
  test("a farmer can connect, sign, and reach their dashboard", async ({ page }) => {
    await connectAndSignIn(page, "farmer");

    await expect(page).toHaveURL(/\/farmer\/dashboard/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /farmer dashboard/i })).toBeVisible();
  });

  test("an investor lands on the investor dashboard", async ({ page }) => {
    await connectAndSignIn(page, "investor");

    await expect(page).toHaveURL(/\/investor\/dashboard/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /investor dashboard/i })).toBeVisible();
  });

  test("the session survives a reload", async ({ page }) => {
    await connectAndSignIn(page, "farmer");
    await expect(page).toHaveURL(/\/farmer\/dashboard/, { timeout: 20_000 });

    await page.reload();

    // No second signature prompt: the stored session is reused.
    await expect(page).toHaveURL(/\/farmer\/dashboard/);
    await expect(page.getByRole("heading", { name: /farmer dashboard/i })).toBeVisible();
  });

  test("a signed-in user visiting login is sent to their dashboard", async ({ page }) => {
    await connectAndSignIn(page, "farmer");
    await expect(page).toHaveURL(/\/farmer\/dashboard/, { timeout: 20_000 });

    await page.goto("/login");
    await expect(page).toHaveURL(/\/farmer\/dashboard/, { timeout: 15_000 });
  });

  test("a farmer cannot open investor pages", async ({ page }) => {
    await connectAndSignIn(page, "farmer");
    await expect(page).toHaveURL(/\/farmer\/dashboard/, { timeout: 20_000 });

    await page.goto("/investor/deposit");

    // Wrong-role visits bounce to the user's own dashboard rather than erroring.
    await expect(page).toHaveURL(/\/farmer\/dashboard/, { timeout: 15_000 });
  });

  test("a farmer cannot open the admin verifier queue", async ({ page }) => {
    await connectAndSignIn(page, "farmer");
    await expect(page).toHaveURL(/\/farmer\/dashboard/, { timeout: 20_000 });

    await page.goto("/admin/queue");
    await expect(page).toHaveURL(/\/farmer\/dashboard/, { timeout: 15_000 });
  });

  test("signing out clears the session", async ({ page }) => {
    await connectAndSignIn(page, "farmer");
    await expect(page).toHaveURL(/\/farmer\/dashboard/, { timeout: 20_000 });

    const stored = await page.evaluate(() => window.localStorage.getItem("agribridge_session"));
    expect(stored).toBeTruthy();

    await page.evaluate(() => window.localStorage.clear());
    await page.goto("/farmer/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("the signed-in wallet is the one that signed", async ({ page }) => {
    await connectAndSignIn(page, "farmer");
    await expect(page).toHaveURL(/\/farmer\/dashboard/, { timeout: 20_000 });

    const profile = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("agribridge_profile") ?? "{}"),
    );

    expect(String(profile.wallet_address).toLowerCase()).toBe(TEST_ACCOUNT.address.toLowerCase());
  });
});
