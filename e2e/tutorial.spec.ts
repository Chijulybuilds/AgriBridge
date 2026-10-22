import { test, expect, type Page } from "@playwright/test";

import { APP_TOUR, SECTION_TOURS } from "../lib/tours";
import { installMockWallet, signIn } from "./fixtures/mockWallet";

/**
 * The tutorials and the "i" buttons: what a first-time visitor sees, that every tour plays to the
 * end, that it can be replayed, and that the help notes open and close. These tests start with the
 * tutorials switched on (the other suites turn them off).
 */
test.use({ storageState: { cookies: [], origins: [] } });

const SHOTS = process.env.E2E_SHOTS;
async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tutorial-${name}.png` });
}

/** Clicks Next until the tour finishes, checking each step's count as it goes. */
async function playToTheEnd(page: Page, steps: number, shotPrefix?: string) {
  const tour = page.getByTestId("tutorial");
  for (let i = 1; i <= steps; i++) {
    await expect(tour).toHaveAttribute("data-step", String(i), { timeout: 10_000 });
    await expect(page.getByTestId("tour-next")).toBeEnabled({ timeout: 10_000 });
    if (shotPrefix && (i <= 3 || i === steps)) await shot(page, `${shotPrefix}-${i}`);
    await page.getByTestId("tour-next").click();
  }
  await expect(tour).toHaveCount(0);
}

test("a first visit offers the tour, and the short tour plays to the end", async ({ page }) => {
  await installMockWallet(page, "farmer", { tutorials: true });
  await page.goto("/login");
  await expect(page.getByTestId("tutorial-chooser")).toBeVisible();
  await shot(page, "welcome");
  await page.getByTestId("tour-short").click();

  // Lesson one: the "i" button, circled on the sign-in page.
  await expect(page.getByTestId("tutorial")).toContainText("Tap the \"i\"");
  await expect(page.locator(".tour-ring")).toBeVisible();
  await playToTheEnd(page, APP_TOUR.short.length, "short");
});

test("the full tour plays to the end, and the Tutorial button replays it", async ({ page }) => {
  await installMockWallet(page, "farmer", { tutorials: true });
  await page.goto("/login");
  await page.getByTestId("tour-full").click();
  await playToTheEnd(page, APP_TOUR.full.length, "full");

  // Once answered, the welcome card doesn't come back by itself...
  await page.goto("/login");
  await expect(page.getByTestId("tutorial-chooser")).toHaveCount(0);
  // ...but the Tutorial button brings it back.
  await page.getByTestId("tutorial-button").first().click();
  await expect(page.getByTestId("tutorial-chooser")).toBeVisible();
  await page.getByTestId("tour-skip").click();
  await expect(page.getByTestId("tutorial-chooser")).toHaveCount(0);
});

test("an \"i\" button explains a word in three parts, and Escape closes it", async ({ page }) => {
  await installMockWallet(page, "farmer", { tutorials: true });
  await page.goto("/login");
  await page.getByTestId("tour-skip").click();

  await page.getByTestId("info-metamask").click();
  const card = page.getByTestId("info-card");
  await expect(card).toContainText("What it is");
  await expect(card).toContainText("Why it matters to you");
  await expect(card).toContainText("What to do");
  await shot(page, "info-card");
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId("info-metamask")).toBeFocused();
});

test("a section's own guide plays the first time it is opened, circling the real page", async ({ page }) => {
  await installMockWallet(page, "farmer", { tutorials: true });
  // Someone who has already answered the welcome card.
  // (Only before the first page: the init script runs on every load, and must not undo what the page records.)
  await page.addInitScript(() => {
    if (!localStorage.getItem("agribridge.tutorial.seen.v1")) localStorage.setItem("agribridge.tutorial.seen.v1", JSON.stringify({ welcome: true }));
  });
  await signIn(page, "farmer");

  const tour = page.getByTestId("tutorial");
  await expect(tour).toContainText(SECTION_TOURS.farmer.title, { timeout: 15_000 });
  await expect(page.locator(".tour-ring")).toBeVisible();
  await shot(page, "farmer-section");
  await playToTheEnd(page, SECTION_TOURS.farmer.full.length);

  // It doesn't repeat by itself; "How this page works" replays it.
  await page.reload();
  await expect(page.getByRole("heading", { name: /farmer overview/i })).toBeVisible();
  await page.waitForTimeout(1_500);
  await expect(tour).toHaveCount(0);
  await page.getByTestId("page-tour").click();
  await expect(tour).toContainText(SECTION_TOURS.farmer.title);
});

test("every section's guide plays to the end from its \"How this page works\" button", async ({ page }) => {
  await installMockWallet(page, "farmer");
  await signIn(page, "farmer");
  const pages: Record<string, string> = {
    farmer: "/farmer",
    deliver: "/farmer/deliver",
    advance: "/farmer/advance",
    loans: "/farmer/loans",
    stock: "/stock",
    collect: "/stock/collect",
    sell: "/market/sell",
    market: "/market",
    investor: "/investor",
    risk: "/investor/risk",
  };
  for (const [section, path] of Object.entries(pages)) {
    await page.goto(path);
    await page.getByTestId("page-tour").click();
    await expect(page.getByTestId("tutorial")).toContainText(SECTION_TOURS[section as keyof typeof SECTION_TOURS].title);
    await playToTheEnd(page, SECTION_TOURS[section as keyof typeof SECTION_TOURS].full.length);
  }
});

test("the help page lists every word and can be searched", async ({ page }) => {
  await installMockWallet(page, "farmer");
  await page.goto("/help");
  await expect(page.getByTestId("help-advance")).toBeVisible();
  await page.getByTestId("help-search").fill("cushion");
  await expect(page.getByTestId("help-cushion")).toBeVisible();
  await expect(page.getByTestId("help-advance")).toHaveCount(0);
  await shot(page, "help-page");
});
