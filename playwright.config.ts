import { defineConfig, devices } from "@playwright/test";

import { deploymentEnv } from "./e2e/fixtures/deployment";
import { ACCOUNTS } from "./e2e/fixtures/mockWallet";

/**
 * End-to-end configuration.
 *
 * The suite drives the real Next.js app with a mock wallet injected into the
 * page (e2e/fixtures/mockWallet.ts) that sends real transactions to a local
 * Anvil chain. When the demo contracts are deployed there (see the e2e job in
 * .github/workflows/test.yml), their addresses are passed to the app; otherwise
 * the journeys are skipped.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // The journeys share one chain and run in order.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 120_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // Next's first dev compile is slow on cold caches and slow filesystems.
    timeout: 300_000,
    env: {
      NEXT_PUBLIC_E2E: "1",
      NEXT_PUBLIC_CHAIN_ID: "31337",
      NEXT_PUBLIC_RPC_URL: "http://127.0.0.1:8545",
      NEXT_PUBLIC_DEPLOY_BLOCK: "0",
      NEXT_PUBLIC_VERIFIER_SAFE: ACCOUNTS.verifier,
      ...deploymentEnv(),
    },
  },
});
