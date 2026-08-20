import { test, expect } from "../support/fixtures";
import { DEFAULT_LOCAL_ZONE, expectedTimeIn } from "../support/time";

/**
 * SPEC R1 - "The web app lets users add timezones to a table and see the current
 * time in each timezone."
 */
test.describe("R1 - current time per timezone", () => {
  test(
    "shows the current time for the local row",
    { annotation: [{ type: "spec", description: "R1" }] },
    async ({ app }) => {
      await app.open();

      const [local] = await app.readRows();
      expect(local.time).toBe(expectedTimeIn(DEFAULT_LOCAL_ZONE));
    }
  );

  test(
    "shows the correct current time for every selectable zone",
    { annotation: [{ type: "spec", description: "R1" }] },
    async ({ app }) => {
      await app.open();

      const zones = await app.availableZoneValues();
      expect(zones.length).toBeGreaterThan(0);

      for (const zone of zones) {
        await app.addTimezone(`Office ${zone}`, zone);
        await expect(app.rowForZone(zone)).toBeVisible();
      }

      const rows = await app.readRows();
      for (const zone of zones) {
        const row = rows.find((r) => r.zone === zone);
        expect(row, `expected a row for ${zone}`).toBeDefined();
        expect(row!.time, `wall-clock time for ${zone}`).toBe(expectedTimeIn(zone));
      }
    }
  );

  test(
    "the displayed time keeps up with the passing of time",
    {
      tag: "@known-bug",
      annotation: [
        { type: "spec", description: "R1" },
        { type: "issue", description: "ISSUE-05 - times are frozen at page load" },
      ],
    },
    async ({ app }) => {
      // A clock that is only correct at the instant the page loaded is not a clock.
      // 45 minutes is well past any reasonable refresh interval.
      await app.openWithControllableClock();

      const before = (await app.readRows())[0].time;
      await app.advanceClockBy("45:00");

      await expect
        .poll(async () => (await app.readRows())[0].time, {
          message: "the local row's time should advance without a manual reload",
          timeout: 10_000,
        })
        .not.toBe(before);
    }
  );

  test(
    "a stale rendered time is corrected on reload",
    { annotation: [{ type: "spec", description: "R1" }] },
    async ({ app, page }) => {
      await app.open();
      const initial = (await app.readRows())[0].time;

      await page.clock.setFixedTime(new Date("2026-08-19T20:05:00Z"));
      await app.reload();

      const after = (await app.readRows())[0].time;
      expect(after).not.toBe(initial);
      expect(after).toBe(expectedTimeIn(DEFAULT_LOCAL_ZONE, new Date("2026-08-19T20:05:00Z")));
    }
  );

  test.describe("on a phone-sized viewport", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test(
      "the timezone and time are still readable",
      {
        tag: "@known-bug",
        annotation: [
          { type: "spec", description: "R1" },
          {
            type: "issue",
            description: "ISSUE-09 - zone and time columns are hidden below 1024px",
          },
        ],
      },
      async ({ app }) => {
        await app.open();
        await app.addTimezone("Head Office", "America/New_York");

        // The whole point of the app is the time. If it is invisible on a phone,
        // the feature does not exist there - regardless of what the DOM contains.
        await expect(
          app.rows.first().locator("td").nth(1),
          "Timezone cell should be visible on mobile"
        ).toBeVisible();
        await expect(
          app.rows.first().locator("td").nth(2),
          "time cell should be visible on mobile"
        ).toBeVisible();
      }
    );

    test(
      "header and body cell counts stay in step",
      {
        tag: "@known-bug",
        annotation: [
          { type: "spec", description: "R1" },
          { type: "issue", description: "ISSUE-09" },
        ],
      },
      async ({ app }) => {
        await app.open();

        // Headers are always rendered but two body cells are display:none below `lg`,
        // so the table advertises four columns and delivers two.
        const visibleHeaders = await app.table
          .locator("thead th")
          .evaluateAll((els) => els.filter((e) => !!(e as HTMLElement).offsetWidth).length);
        const visibleCells = await app.rows
          .first()
          .locator("td")
          .evaluateAll((els) => els.filter((e) => !!(e as HTMLElement).offsetWidth).length);

        expect(visibleCells, "visible body cells should match visible headers").toBe(
          visibleHeaders
        );
      }
    );
  });
});
