import { defineConfig, devices } from "@playwright/test";

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * Notes on choices made for this suite:
 *  - `timezoneId` / `locale` are pinned at the top level. This app renders wall-clock
 *    times, so an unpinned machine timezone is the single biggest source of flake.
 *    Individual specs override `timezoneId` where the local zone is the thing under test.
 *  - `webServer` lets `npm run e2e` work from a cold checkout and in CI without a
 *    human remembering to start `npm run dev` first.
 */
export default defineConfig({
  testDir: "./e2e/specs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["github"]]
    : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3100",

    /* Determinism: pin the browser's clock-relevant environment. */
    timezoneId: "America/Vancouver",
    locale: "en-US",

    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  /**
   * Cross-engine coverage matters more than usual here: every requirement depends on
   * `Intl` timezone resolution and formatting, which is implemented independently by
   * each engine (V8/ICU vs SpiderMonkey/ICU vs JavaScriptCore). A bug in how the app
   * uses `Intl` can easily present differently per engine.
   *
   * WebKit is deliberately absent. It is a genuine gap, not an oversight - see
   * "Cross-browser coverage" in docs/TEST-PLAN.md for why, and what it would take.
   */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
  ],

  /**
   * Tests run against a production build, not `next dev`.
   *
   * The dev server compiles on demand, so under parallel load it becomes the slowest
   * thing in the run and navigations start losing races. That showed up as three
   * reload-based tests failing on Firefox in a full run while passing 3/3 in
   * isolation - flakiness caused by the harness, not the app. A production build is
   * deterministic, faster, and is what users actually get.
   *
   * Port 3100 keeps this off 3000, so a dev server left running by hand is never
   * silently picked up as the system under test.
   */
  webServer: {
    command: "npm run build && npm run start:test",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
