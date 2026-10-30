import { defineConfig, devices } from "@playwright/test";

/**
 * The browser tests (pre-launch audit M5, and the live-game suite for the
 * PokerLedger refactor), on a phone-sized screen against the testbed app,
 * which must already be running: npm run testbed:dev locally, npm run
 * testbed:start in CI.
 * Usage: npm run testbed:e2e
 */
export default defineConfig({
  testDir: "./testbed/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${process.env.TESTBED_PORT || 3006}`,
    // CI keeps nothing: the repository is public, and a trace holds the test
    // session's cookies. Locally a failure leaves a trace in test-results/.
    trace: process.env.CI ? "off" : "retain-on-failure",
    screenshot: process.env.CI ? "off" : "only-on-failure",
  },
  projects: [{ name: "phone", use: { ...devices["Pixel 7"] } }],
});
