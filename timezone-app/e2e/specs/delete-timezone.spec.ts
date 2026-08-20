import { test, expect } from "../support/fixtures";

/**
 * SPEC R5 - "The user can delete any rows from the table except for the 'You' record."
 */
test.describe("R5 - deleting records", () => {
  test(
    "deletes the row the user asked for",
    { annotation: [{ type: "spec", description: "R5" }] },
    async ({ app }) => {
      await app.open();
      await app.addTimezone("Head Office", "America/New_York");
      await app.addTimezone("Islands", "Pacific/Honolulu");

      await app.deleteRowForZone("America/New_York");

      await expect(app.rowForZone("America/New_York")).toHaveCount(0);
      await expect(app.rowForZone("Pacific/Honolulu")).toHaveCount(1);
      await expect(app.localRow()).toHaveCount(1);
    }
  );

  test(
    "the 'You' row's delete control is disabled",
    {
      tag: "@known-bug",
      annotation: [
        { type: "spec", description: "R5" },
        {
          type: "issue",
          description: "ISSUE-02 - the 'You' row can be deleted",
        },
      ],
    },
    async ({ app }) => {
      await app.open();

      // The styling for a disabled state is already in the markup; the `disabled`
      // attribute itself is never applied.
      await expect(app.localDeleteButton()).toBeDisabled();
    }
  );

  test(
    "clicking delete on the 'You' row does not remove it",
    {
      tag: "@known-bug",
      annotation: [
        { type: "spec", description: "R5" },
        { type: "issue", description: "ISSUE-02" },
      ],
    },
    async ({ app }) => {
      await app.open();
      await app.addTimezone("Head Office", "America/New_York");

      // force:true skips the actionability check so this test asserts behaviour
      // rather than duplicating the `toBeDisabled` check above. Verified against a
      // genuinely disabled button: Playwright does not throw, and the browser does
      // not dispatch the click, so once the fix lands this passes rather than
      // erroring. That matters - a guard that breaks when the bug is fixed is
      // worse than no guard, because it trains people to delete it.
      await app.localDeleteButton().click({ force: true });

      await expect(app.localRow(), "the 'You' row must survive").toHaveCount(1);
      await expect(app.rows).toHaveCount(2);
    }
  );

  test(
    "the 'You' row is still protected after a reload",
    {
      tag: "@known-bug",
      annotation: [
        { type: "spec", description: "R5" },
        { type: "issue", description: "ISSUE-02" },
      ],
    },
    async ({ app }) => {
      await app.open();
      await app.reload();

      await expect(app.localDeleteButton()).toBeDisabled();
    }
  );

  test(
    "deleting one row leaves other rows that share its label alone",
    {
      tag: "@known-bug",
      annotation: [
        { type: "spec", description: "R5" },
        {
          type: "issue",
          description: "ISSUE-03 - delete matches on label, so it removes every match",
        },
      ],
    },
    async ({ app }) => {
      // Nothing requires labels to be unique, so two rows may legitimately share one.
      await app.open();
      await app.addTimezone("Team", "America/Chicago");
      await app.addTimezone("Team", "America/Denver");

      await app.deleteRowForZone("America/Chicago");

      await expect(app.rowForZone("America/Chicago")).toHaveCount(0);
      await expect(
        app.rowForZone("America/Denver"),
        "the other 'Team' row was not the one the user deleted"
      ).toHaveCount(1);
    }
  );

  test(
    "deleting a row labelled 'Local' does not take the 'You' row with it",
    {
      tag: "@known-bug",
      annotation: [
        { type: "spec", description: "R5" },
        { type: "issue", description: "ISSUE-03" },
      ],
    },
    async ({ app }) => {
      // The auto-created record is labelled "Local", so a user who types that same
      // word is on a collision course with it.
      await app.open();
      await app.addTimezone("Local", "America/New_York");

      await app.deleteRowForZone("America/New_York");

      await expect(app.localRow(), "the 'You' row must survive").toHaveCount(1);
      await expect(app.rows).toHaveCount(1);
    }
  );

  test(
    "deletions persist across a reload",
    { annotation: [{ type: "spec", description: "R5" }] },
    async ({ app }) => {
      await app.open();
      await app.addTimezone("Head Office", "America/New_York");
      await app.addTimezone("Islands", "Pacific/Honolulu");

      await app.deleteRowForZone("America/New_York");
      await app.reload();

      await expect(app.rowForZone("America/New_York")).toHaveCount(0);
      await expect(app.rows).toHaveCount(2);
    }
  );

  test(
    "every row except 'You' can be removed, leaving just the local record",
    { annotation: [{ type: "spec", description: "R5" }] },
    async ({ app }) => {
      await app.open();
      await app.addTimezone("Head Office", "America/New_York");
      await app.addTimezone("Support", "America/Chicago");
      await app.addTimezone("Islands", "Pacific/Honolulu");

      for (const zone of ["America/New_York", "America/Chicago", "Pacific/Honolulu"]) {
        await app.deleteRowForZone(zone);
      }

      await expect(app.rows).toHaveCount(1);
      await expect(app.localRow()).toHaveCount(1);
    }
  );
});
