import { test, expect } from "../support/fixtures";
import { DEFAULT_LOCAL_ZONE, expectedTimeIn } from "../support/time";

/**
 * SPEC R2 - "A local timezone record showing the user's current timezone should be
 * automatically created. This row should be marked as 'You'."
 */
test.describe("R2 - the automatic local record", () => {
  test(
    "is created on a first visit with no saved data",
    { annotation: [{ type: "spec", description: "R2" }] },
    async ({ app }) => {
      await app.open();

      await expect(app.rows).toHaveCount(1);
      await expect(app.localRow()).toBeVisible();
    }
  );

  test(
    "is marked as 'You'",
    { annotation: [{ type: "spec", description: "R2" }] },
    async ({ app }) => {
      await app.open();

      const [local] = await app.readRows();
      expect(local.isLocal).toBe(true);
    }
  );

  test(
    "reports the browser's own timezone and time",
    { annotation: [{ type: "spec", description: "R2" }] },
    async ({ app }) => {
      await app.open();

      const [local] = await app.readRows();
      expect(local.zone).toBe(DEFAULT_LOCAL_ZONE);
      expect(local.time).toBe(expectedTimeIn(DEFAULT_LOCAL_ZONE));
    }
  );

  // Parametrised so a hard-coded or North-America-only assumption cannot pass.
  for (const zone of ["Europe/Paris", "Asia/Tokyo", "Pacific/Honolulu"]) {
    test.describe(`when the browser is in ${zone}`, () => {
      test.use({ timezoneId: zone });

      test(
        "the local record follows the browser",
        { annotation: [{ type: "spec", description: "R2" }] },
        async ({ app }) => {
          await app.open();

          const [local] = await app.readRows();
          expect(local.isLocal).toBe(true);
          expect(local.zone).toBe(zone);
          expect(local.time).toBe(expectedTimeIn(zone));
        }
      );
    });
  }

  test(
    "there is never more than one 'You' row",
    { annotation: [{ type: "spec", description: "R2" }] },
    async ({ app }) => {
      await app.open();
      await app.addTimezone("Head Office", "America/New_York");
      await app.addTimezone("Support", "America/Chicago");
      await app.reload();

      await expect(app.localRow()).toHaveCount(1);
    }
  );

  test(
    "adding a different zone that shares the local UTC offset keeps both rows",
    { annotation: [{ type: "spec", description: "R2" }] },
    async ({ app }) => {
      // The browser is in America/Vancouver; America/Los_Angeles is a *different*
      // zone that happens to share its offset. This guards against identity or
      // deduplication implemented on UTC offset rather than on zone id, which would
      // wrongly treat these two as the same place. The genuine same-zone case is
      // covered separately below and currently fails as ISSUE-14.
      await app.open();
      await app.addTimezone("Portland office", "America/Los_Angeles");

      await expect(app.localRow()).toHaveCount(1);
      await expect(app.rows).toHaveCount(2);
      await expect(app.rowForZone("America/Los_Angeles")).toHaveCount(1);
    }
  );

  test.describe("when the user adds the very zone they are in", () => {
    test.use({ timezoneId: "America/New_York" });

    test(
      "the 'You' record is not replaced by the new row",
      {
        tag: "@known-bug",
        annotation: [
          { type: "spec", description: "R2" },
          {
            type: "issue",
            description:
              "ISSUE-14 - adding your own zone silently destroys the 'You' record",
          },
        ],
      },
      async ({ app }) => {
        // The add handler strips any existing row for the incoming zone before
        // appending. The local record is a row like any other, so it is stripped
        // too - the one row R5 says can never be removed.
        await app.open();
        await expect(app.localRow()).toHaveCount(1);

        await app.addTimezone("Work", "America/New_York");

        await expect(app.localRow(), "the 'You' record must survive").toHaveCount(1);
        await expect(app.rows).toHaveCount(2);
      }
    );
  });

  test(
    "survives a reload without disturbing saved rows",
    { annotation: [{ type: "spec", description: "R2" }] },
    async ({ app }) => {
      await app.open();
      await app.addTimezone("Head Office", "America/New_York");
      await app.addTimezone("Support", "America/Chicago");

      await app.reload();

      await expect(app.rows).toHaveCount(3);
      await expect(app.localRow()).toHaveCount(1);
    }
  );

  test(
    "is restored after removal without destroying the user's other timezones",
    {
      tag: "@known-bug",
      annotation: [
        { type: "spec", description: "R2" },
        {
          type: "issue",
          description:
            "ISSUE-04 - restoring the local record overwrites the whole table",
        },
      ],
    },
    async ({ app }) => {
      // Start from saved data where the local record has gone missing (a wiped key,
      // a failed write, or the deletion that ISSUE-02 currently allows). Seeding
      // before the first load avoids racing the app's own persistence effect.
      await app.seedStorageBeforeLoad(
        JSON.stringify([
          { label: "Head Office", zone: "America/New_York", isLocal: false },
          { label: "Support", zone: "America/Chicago", isLocal: false },
        ])
      );
      await app.open();

      await expect(app.localRow(), "the local record should be recreated").toHaveCount(1);
      await expect(
        app.rowForZone("America/New_York"),
        "an existing saved timezone must not be destroyed"
      ).toHaveCount(1);
      await expect(app.rowForZone("America/Chicago")).toHaveCount(1);
      await expect(app.rows).toHaveCount(3);
    }
  );
});
