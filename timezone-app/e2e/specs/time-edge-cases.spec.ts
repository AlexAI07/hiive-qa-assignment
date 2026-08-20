import { test, expect } from "../support/fixtures";
import { expectedTimeIn } from "../support/time";

/**
 * Time is the app's whole subject, so the instants where time arithmetic goes wrong
 * deserve direct coverage: midnight, noon, DST transitions and non-hour offsets.
 *
 * Most of these pass today, because the app delegates formatting to `Intl` and
 * `Intl` gets this right. They are here as regression guards rather than as bug
 * hunts: the moment anyone replaces `toLocaleTimeString` with offset arithmetic - a
 * natural instinct when fixing the ordering bug in ISSUE-01 - these are the cases
 * that break first, and they break silently.
 *
 * The one exception is ordering across midnight, which fails today for the same
 * reason as ISSUE-01 and is tagged accordingly rather than raised as a new defect.
 */

/**
 * 2026-08-19T07:00:00Z places the six selectable zones either side of midnight:
 *   Pacific/Honolulu     21:00   (9:00 PM)
 *   America/Juneau       23:00   (11:00 PM)
 *   America/Los_Angeles  00:00   (12:00 AM)  <- midnight, next calendar day
 *   America/Denver       01:00   (1:00 AM)
 */
const ACROSS_MIDNIGHT = new Date("2026-08-19T07:00:00Z");

/** 2026-08-19T19:00:00Z puts America/Los_Angeles at exactly 12:00 noon. */
const AT_NOON = new Date("2026-08-19T19:00:00Z");

test.describe("Midnight and noon boundaries", () => {
  test.use({ timezoneId: "Pacific/Honolulu" });

  test(
    "midnight renders as 12:00 AM, not 0:00",
    { annotation: [{ type: "spec", description: "R1" }] },
    async ({ app }) => {
      await app.openAt(ACROSS_MIDNIGHT);
      await app.addTimezone("West coast", "America/Los_Angeles");

      const row = (await app.readRows()).find((r) => r.zone === "America/Los_Angeles");
      expect(row!.time).toBe(expectedTimeIn("America/Los_Angeles", ACROSS_MIDNIGHT));
      expect(row!.time).toBe("12:00 AM");
    }
  );

  test(
    "noon renders as 12:00 PM, not 12:00 AM",
    { annotation: [{ type: "spec", description: "R1" }] },
    async ({ app }) => {
      // The 12-hour clock's two classic off-by-twelve traps sit on the same value,
      // so asserting both midnight and noon is what makes the pair meaningful.
      await app.openAt(AT_NOON);
      await app.addTimezone("West coast", "America/Los_Angeles");

      const row = (await app.readRows()).find((r) => r.zone === "America/Los_Angeles");
      expect(row!.time).toBe(expectedTimeIn("America/Los_Angeles", AT_NOON));
      expect(row!.time).toBe("12:00 PM");
    }
  );

  test(
    "rows spanning midnight are ordered by time of day, not by clock string",
    {
      tag: "@known-bug",
      annotation: [
        { type: "spec", description: "R3" },
        {
          type: "issue",
          description:
            "ISSUE-01 - same wrong comparator; this is the case that also defeats " +
            "the obvious wrong fix of sorting the rendered time string",
        },
      ],
    },
    async ({ app }) => {
      await app.openAt(ACROSS_MIDNIGHT);
      await app.addTimezone("West coast", "America/Los_Angeles"); // 12:00 AM
      await app.addTimezone("Mountain", "America/Denver"); //         1:00 AM
      await app.addTimezone("Alaska", "America/Juneau"); //          11:00 PM

      // Sorting the rendered strings would give "1:00 AM", "11:00 PM", "12:00 AM" -
      // plausible-looking and wrong. Correct order is by minutes since local midnight.
      expect((await app.readRows()).map((r) => r.zone)).toEqual([
        "America/Los_Angeles", // 00:00
        "America/Denver", //      01:00
        "Pacific/Honolulu", //    21:00 (the browser's own zone)
        "America/Juneau", //      23:00
      ]);
    }
  );
});

/**
 * Engines disagree on whether to canonicalise legacy IANA aliases, so the id the
 * app receives from the browser is not always the id that was requested. The time
 * is identical either way; only the displayed identifier differs. See ISSUE-17.
 */
const ACCEPTED_IDS: Record<string, string[]> = {
  "Asia/Kolkata": ["Asia/Kolkata", "Asia/Calcutta"],
  "Asia/Kathmandu": ["Asia/Kathmandu", "Asia/Katmandu"],
  "America/St_Johns": ["America/St_Johns"],
};

test.describe("Non-hour UTC offsets", () => {
  // Half- and quarter-hour offsets are where offset arithmetic done in whole hours
  // silently produces a time that is 30 or 45 minutes wrong - wrong enough to miss
  // a meeting, close enough to look right.
  for (const zone of ["Asia/Kolkata", "Asia/Kathmandu", "America/St_Johns"]) {
    test.describe(`browser in ${zone}`, () => {
      test.use({ timezoneId: zone });

      test(
        "the local record shows the correct time",
        { annotation: [{ type: "spec", description: "R1, R2" }] },
        async ({ app }) => {
          await app.open();

          const [local] = await app.readRows();
          expect(local.isLocal).toBe(true);
          // The time is the requirement; the identifier is asserted leniently
          // because engine canonicalisation is outside the app's control.
          expect(ACCEPTED_IDS[zone]).toContain(local.zone);
          expect(local.time).toBe(expectedTimeIn(zone));
          // Guard against whole-hour truncation passing by coincidence.
          expect(local.time).not.toBe(expectedTimeIn("UTC"));
        }
      );
    });
  }

  test.describe("browser in Asia/Kolkata", () => {
    test.use({ timezoneId: "Asia/Kolkata" });

    test(
      "the timezone column shows the modern zone name, not a legacy alias",
      {
        tag: "@known-bug",
        annotation: [
          { type: "spec", description: "R2" },
          {
            type: "issue",
            description:
              "ISSUE-17 - Chromium reports the legacy alias and the app displays it raw",
          },
        ],
      },
      async ({ app, browserName }) => {
        // Firefox canonicalises to the modern name, so this defect is Chromium-only.
        // Skipping keeps the known-bug lane honest: a browser where the bug does not
        // exist must not report a "fix has landed" signal.
        test.skip(
          browserName !== "chromium",
          "Only Chromium reports the legacy alias; nothing to assert elsewhere"
        );

        await app.open();

        const [local] = await app.readRows();
        expect(local.zone).toBe("Asia/Kolkata");
      }
    );
  });
});

test.describe("Daylight saving transitions", () => {
  test.use({ timezoneId: "America/New_York" });

  test(
    "the skipped hour at spring forward is handled",
    { annotation: [{ type: "spec", description: "R1" }] },
    async ({ app }) => {
      // US DST begins 2026-03-08 at 07:00Z: 01:59 EST is followed by 03:00 EDT.
      // 02:00-02:59 never happens in this zone on this date.
      const before = new Date("2026-03-08T06:59:00Z");
      const after = new Date("2026-03-08T07:00:00Z");

      await app.openAt(before);
      expect((await app.readRows())[0].time).toBe("1:59 AM");

      await app.reloadAt(after);
      expect(
        (await app.readRows())[0].time,
        "the hour 02:00-02:59 does not exist on this date"
      ).toBe("3:00 AM");
    }
  );

  test(
    "the repeated hour at fall back is handled",
    { annotation: [{ type: "spec", description: "R1" }] },
    async ({ app }) => {
      // US DST ends 2026-11-01 at 06:00Z: 01:30 occurs twice, once EDT once EST.
      // A time-only display cannot distinguish them, and is not required to - but it
      // must not throw, skip, or render a shifted value at either instant.
      const firstPass = new Date("2026-11-01T05:30:00Z"); // 01:30 EDT
      const secondPass = new Date("2026-11-01T06:30:00Z"); // 01:30 EST

      await app.openAt(firstPass);
      expect((await app.readRows())[0].time).toBe(expectedTimeIn("America/New_York", firstPass));

      await app.reloadAt(secondPass);
      expect((await app.readRows())[0].time).toBe(expectedTimeIn("America/New_York", secondPass));
    }
  );

  test(
    "a zone that observes no DST is unaffected while its neighbours shift",
    { annotation: [{ type: "spec", description: "R1" }] },
    async ({ app }) => {
      // Honolulu never shifts, so the gap between it and New York changes by an hour
      // across the transition. Anything that caches a fixed offset gets this wrong.
      const winter = new Date("2026-01-15T18:00:00Z");
      const summer = new Date("2026-07-15T18:00:00Z");

      await app.openAt(winter);
      await app.addTimezone("Islands", "Pacific/Honolulu");
      const winterRows = await app.readRows();
      expect(winterRows.find((r) => r.zone === "Pacific/Honolulu")!.time)
        .toBe(expectedTimeIn("Pacific/Honolulu", winter));
      expect(winterRows.find((r) => r.isLocal)!.time)
        .toBe(expectedTimeIn("America/New_York", winter));

      await app.reloadAt(summer);
      const summerRows = await app.readRows();
      expect(summerRows.find((r) => r.zone === "Pacific/Honolulu")!.time)
        .toBe(expectedTimeIn("Pacific/Honolulu", summer));
      expect(summerRows.find((r) => r.isLocal)!.time)
        .toBe(expectedTimeIn("America/New_York", summer));
    }
  );
});
