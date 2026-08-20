import { test as base, expect } from "@playwright/test";
import { TimeKeeperPage } from "./TimeKeeperPage";

/**
 * Fixtures for the Time Keeper suite.
 *
 *  - `app`      : the page object, not yet navigated. Specs choose `open()` (frozen
 *                 clock) or `openWithControllableClock()` so the clock strategy is
 *                 visible in the test body rather than hidden in setup.
 *  - `pageErrors`: uncaught exceptions collected for the lifetime of the test.
 *                 An app that throws while still rendering something is a class of
 *                 bug that assertions on the DOM alone will happily walk past.
 */
type Fixtures = {
  app: TimeKeeperPage;
  pageErrors: string[];
  consoleErrors: string[];
};

export const test = base.extend<Fixtures>({
  pageErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message.split("\n")[0]));
    await use(errors);
  },

  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await use(errors);
  },

  app: async ({ page }, use) => {
    await use(new TimeKeeperPage(page));
  },
});

export { expect };
