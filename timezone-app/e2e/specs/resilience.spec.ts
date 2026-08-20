import { test, expect } from "../support/fixtures";
import { TimeKeeperPage } from "../support/TimeKeeperPage";

/**
 * Not tied to a numbered requirement, but every requirement depends on these holding.
 * Saved state is the app's only datastore, and it lives somewhere the user, other
 * tabs, and browser extensions can all reach.
 */
test.describe("Resilience of persisted state", () => {
  test(
    "recovers from a corrupt saved value instead of showing a blank page",
    {
      tag: "@known-bug",
      annotation: [
        {
          type: "issue",
          description: "ISSUE-08 - malformed storage throws during render, blanking the app",
        },
      ],
    },
    async ({ app, pageErrors }) => {
      await app.seedStorageBeforeLoad("this-is-not-json");
      await app.openRaw();

      // The local record only exists after hydration, so waiting on it proves the
      // client actually recovered. Asserting on <table> alone is satisfied by the
      // server-rendered shell before the crash and passes falsely under load.
      await expect(app.localRow(), "the app should recover with a usable table")
        .toHaveCount(1);
      expect(pageErrors, "no uncaught exceptions").toEqual([]);
    }
  );

  test(
    "recovers when the saved value is valid JSON but the wrong shape",
    {
      tag: "@known-bug",
      annotation: [{ type: "issue", description: "ISSUE-08" }],
    },
    async ({ app, pageErrors }) => {
      await app.seedStorageBeforeLoad(JSON.stringify({ unexpected: "shape" }));
      await app.openRaw();

      await expect(app.localRow(), "the app should recover with a usable table")
        .toHaveCount(1);
      expect(pageErrors).toEqual([]);
    }
  );

  test(
    "tolerates individual records with missing fields",
    { tag: "@known-bug",
    annotation: [{ type: "issue", description: "ISSUE-08" }] },
    async ({ app, pageErrors }) => {
      await app.seedStorageBeforeLoad(JSON.stringify([{ label: "Broken" }, null]));
      await app.openRaw();

      await expect(app.localRow(), "the app should recover with a usable table")
        .toHaveCount(1);
      expect(pageErrors).toEqual([]);
    }
  );

  test(
    "loads cleanly with no errors in the console",
    { annotation: [{ type: "issue", description: "ISSUE-08" }] },
    async ({ app, pageErrors, consoleErrors }) => {
      await app.open();
      await app.addTimezone("Head Office", "America/New_York");

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    }
  );

  test(
    "does not log application state to the console",
    {
      tag: "@known-bug",
      annotation: [
        {
          type: "issue",
          description: "ISSUE-13 - a debug console.log ships on every render",
        },
      ],
    },
    async ({ app, page }) => {
      const logs: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "log") logs.push(msg.text());
      });

      await app.open();
      await app.addTimezone("Head Office", "America/New_York");

      expect(logs, `debug output leaked: ${logs.join(" | ")}`).toEqual([]);
    }
  );

  test(
    "a second tab does not overwrite timezones added in the first",
    {
      tag: "@known-bug",
      annotation: [
        {
          type: "issue",
          description:
            "ISSUE-15 - a second tab writes a stale array over the first tab's data",
        },
      ],
    },
    async ({ app, context }) => {
      // Two tabs is ordinary behaviour, not an edge case. Each holds its own copy
      // of the table in React state and writes the whole array back on every
      // change, so whichever tab saves last wins and the other tab's work is gone.
      await app.open();

      const secondTab = new TimeKeeperPage(await context.newPage());
      await secondTab.open();

      await app.addTimezone("Added in tab A", "America/New_York");
      await secondTab.addTimezone("Added in tab B", "America/Chicago");

      await app.reload();

      await expect(
        app.rowForZone("America/New_York"),
        "the first tab's timezone must not be destroyed by the second"
      ).toHaveCount(1);
      await expect(app.rowForZone("America/Chicago")).toHaveCount(1);
    }
  );

  test(
    "keeps the two storage representations in agreement",
    { annotation: [{ type: "spec", description: "R2/R4" }] },
    async ({ app }) => {
      await app.open();
      await app.addTimezone("Head Office", "America/New_York");

      const stored = JSON.parse((await app.readStorage()) ?? "[]");
      const displayed = await app.readRows();

      expect(stored).toHaveLength(displayed.length);
      expect(stored.filter((r: { isLocal: boolean }) => r.isLocal)).toHaveLength(1);
    }
  );
});
