import { test, expect } from "../support/fixtures";
import { DEFAULT_LOCAL_ZONE, minutesOfDayIn } from "../support/time";

/**
 * SPEC R3 - "The table should be sorted by the current time, with the earliest time
 * first and the latest time last."
 */
test.describe("R3 - ordering by current time", () => {
  test(
    "orders rows earliest time first",
    {
      tag: "@known-bug",
      annotation: [
        { type: "spec", description: "R3" },
        { type: "issue", description: "ISSUE-01 - the table is sorted by label" },
      ],
    },
    async ({ app }) => {
      await app.open();
      await app.addTimezone("Head Office", "America/New_York"); // 09:30 EDT
      await app.addTimezone("Islands", "Pacific/Honolulu"); // 03:30 HST

      const rows = await app.readRows();
      const actual = rows.map((r) => r.zone);
      const expected = [...rows]
        .sort((a, b) => minutesOfDayIn(a.zone) - minutesOfDayIn(b.zone))
        .map((r) => r.zone);

      expect(actual).toEqual(expected);
    }
  );

  test(
    "ordering is driven by time, not by the label text",
    {
      tag: "@known-bug",
      annotation: [
        { type: "spec", description: "R3" },
        { type: "issue", description: "ISSUE-01" },
      ],
    },
    async ({ app }) => {
      // Labels are chosen so alphabetical order is the exact reverse of time order.
      // Anything that passes this genuinely sorts on time.
      await app.open();
      await app.addTimezone("Alpha", "America/New_York"); // latest  (09:30)
      await app.addTimezone("Zulu", "Pacific/Honolulu"); // earliest (03:30)

      const zones = (await app.readRows()).map((r) => r.zone);
      expect(zones).toEqual([
        "Pacific/Honolulu",
        DEFAULT_LOCAL_ZONE, // 06:30, sits in the middle
        "America/New_York",
      ]);
    }
  );

  test(
    "a newly added row lands in the right position rather than at the end",
    {
      annotation: [
        { type: "spec", description: "R3" },
        { type: "issue", description: "ISSUE-01" },
      ],
    },
    async ({ app }) => {
      await app.open();
      await app.addTimezone("Late", "America/New_York"); // 09:30
      await app.addTimezone("Early", "Pacific/Honolulu"); // 03:30 - must jump to top

      const first = (await app.readRows())[0];
      expect(first.zone).toBe("Pacific/Honolulu");
    }
  );

  test(
    "the local row is ordered by its time like any other row",
    {
      annotation: [
        { type: "spec", description: "R3" },
        { type: "issue", description: "ISSUE-01" },
      ],
    },
    async ({ app }) => {
      await app.open();
      await app.addTimezone("Islands", "Pacific/Honolulu"); // 03:30, before local 06:30

      const rows = await app.readRows();
      expect(rows[0].zone).toBe("Pacific/Honolulu");
      expect(rows[1].isLocal).toBe(true);
    }
  );

  test(
    "ordering is stable across a reload",
    {
      annotation: [
        { type: "spec", description: "R3" },
        { type: "issue", description: "ISSUE-01" },
      ],
    },
    async ({ app }) => {
      await app.open();
      await app.addTimezone("Alpha", "America/New_York");
      await app.addTimezone("Zulu", "Pacific/Honolulu");

      const before = (await app.readRows()).map((r) => r.zone);
      await app.reload();
      const after = (await app.readRows()).map((r) => r.zone);

      expect(after).toEqual(before);
    }
  );
});
