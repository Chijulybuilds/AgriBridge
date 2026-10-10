import { defineConfig } from "@playwright/test";

import base from "../playwright.config";

/**
 * Captures the demo video's screens: the whole AgriBridge story on a local chain, through the
 * real app, as 2× screenshots plus the position of every element the video points at
 * (public/shots/manifest.json). Same app server and test wallet as the end-to-end tests.
 *
 *   anvil  ·  make deploy-local  ·  npx playwright test -c video/playwright.capture.config.ts
 */
export default defineConfig({
  ...base,
  testDir: "./capture",
  testMatch: /.*\.capture\.ts/,
  timeout: 1_800_000,
  use: { ...base.use, actionTimeout: 30_000, navigationTimeout: 60_000 },
  reporter: [["list"]],
  projects: [{ name: "capture", use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } }],
  webServer: base.webServer && !Array.isArray(base.webServer) ? { ...base.webServer, cwd: ".." } : base.webServer,
});
