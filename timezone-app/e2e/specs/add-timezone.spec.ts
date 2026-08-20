import { test, expect } from "../support/fixtures";
import { expectedTimeIn } from "../support/time";

/**
 * SPEC R4 - "The user should be able to add a record for any timezone and provide any
 * label so they can easily see the results. For example: name - 'Europe HQ',
 * timezone - CEST"
 */
test.describe("R4 - adding a timezone record", () => {
  test(
    "adds a row with the chosen label, zone and time",
    { annotation: [{ type: "spec", description: "R4" }] },
    async ({ app }) => {
      await app.open();
      await app.addTimezone("Head Office", "America/New_York");

      const row = (await app.readRows()).find((r) => r.zone === "America/New_York");
      expect(row).toBeDefined();
      expect(row!.label).toBe("Head Office");
      expect(row!.time).toBe(expectedTimeIn("America/New_York"));
      expect(row!.isLocal).toBe(false);
    }
  );

  test(
    "supports the example given in the specification: 'Europe HQ' in CEST",
    {
      tag: "@known-bug",
      annotation: [
        { type: "spec", description: "R4" },
        {
          type: "issue",
          description: "ISSUE-06 - only six US zones are offered; CEST is unreachable",
        },
      ],
    },
    async ({ app }) => {
      await app.open();

      const zones = await app.availableZoneValues();
      expect(zones, "a CEST zone must be selectable").toContain("Europe/Paris");

      await app.addTimezone("Europe HQ", "Europe/Paris");
      const row = (await app.readRows()).find((r) => r.zone === "Europe/Paris");
      expect(row!.label).toBe("Europe HQ");
      expect(row!.time).toBe(expectedTimeIn("Europe/Paris"));
    }
  );

  test(
    "offers timezones outside North America",
    {
      tag: "@known-bug",
      annotation: [
        { type: "spec", description: "R4" },
        { type: "issue", description: "ISSUE-06" },
      ],
    },
    async ({ app }) => {
      await app.open();
      const zones = await app.availableZoneValues();

      const regions = Array.from(new Set(zones.map((z) => z.split("/")[0])));
      expect(
        regions.filter((r) => r !== "America" && r !== "Pacific").length,
        `"any timezone" should reach beyond North America; got: ${zones.join(", ")}`
      ).toBeGreaterThan(0);
    }
  );

  test(
    "keeps two differently-labelled records for the same zone",
    {
      tag: "@known-bug",
      annotation: [
        { type: "spec", description: "R4" },
        {
          type: "issue",
          description: "ISSUE-07 - a second record for a zone silently replaces the first",
        },
      ],
    },
    async ({ app }) => {
      // Two colleagues in the same zone is an ordinary thing to want to track,
      // and nothing in the spec says a zone may appear only once.
      await app.open();
      await app.addTimezone("Head Office", "America/New_York");
      await app.addTimezone("Sales Team", "America/New_York");

      const labels = (await app.readRows()).map((r) => r.label);
      expect(labels).toContain("Head Office");
      expect(labels).toContain("Sales Team");
    }
  );

  test(
    "accepts labels with punctuation, accents and emoji",
    { annotation: [{ type: "spec", description: "R4" }] },
    async ({ app }) => {
      const label = "Zürich (São Paulo desk) - 24/7 🌍";

      await app.open();
      await app.addTimezone(label, "America/Denver");

      expect((await app.readRows()).map((r) => r.label)).toContain(label);
    }
  );

  test(
    "rejects a submission with no label and explains why",
    {
      tag: "@known-bug",
      annotation: [
        { type: "spec", description: "R4" },
        {
          type: "issue",
          description: "ISSUE-11 - invalid submissions fail silently",
        },
      ],
    },
    async ({ app }) => {
      await app.open();
      await app.openForm();
      await app.timezoneSelect.selectOption("America/Denver");
      await app.submitForm();

      await expect(app.rows, "no row should be created").toHaveCount(1);
      await expect(
        app.form.getByText(/required|enter a label|cannot be empty/i),
        "the user should be told why nothing happened"
      ).toBeVisible();
    }
  );

  test(
    "rejects a submission with no timezone and explains why",
    {
      tag: "@known-bug",
      annotation: [
        { type: "spec", description: "R4" },
        { type: "issue", description: "ISSUE-11" },
      ],
    },
    async ({ app }) => {
      await app.open();
      await app.openForm();
      await app.labelInput.fill("Nowhere");
      await app.submitForm();

      await expect(app.rows).toHaveCount(1);
      await expect(
        app.form.getByText(/required|select a timezone|choose/i)
      ).toBeVisible();
    }
  );

  test(
    "does not create an unidentifiable row from a whitespace-only label",
    {
      tag: "@known-bug",
      annotation: [
        { type: "spec", description: "R4" },
        {
          type: "issue",
          description: "ISSUE-10 - whitespace-only labels are accepted",
        },
      ],
    },
    async ({ app }) => {
      await app.open();
      await app.addTimezone("   ", "America/Denver", { expectRow: false });

      const labels = (await app.readRows()).map((r) => r.label);
      expect(labels, "a blank row is not a usable record").not.toContain("");
    }
  );

  test(
    "reopening the form does not silently discard typed input",
    {
      tag: "@known-bug",
      annotation: [
        { type: "spec", description: "R4" },
        {
          type: "issue",
          description:
            "ISSUE-16 - 'Add timezone' is an unlabelled toggle that discards the form",
        },
      ],
    },
    async ({ app }) => {
      // "Add timezone" reads as an open action and never changes to "Cancel", so a
      // second click looks idempotent and instead throws away what has been typed.
      await app.open();
      await app.openForm();
      await app.labelInput.fill("Half-typed label");
      await app.timezoneSelect.selectOption("America/Denver");

      await app.addTimezoneButton.click();
      await app.addTimezoneButton.click();

      await expect(
        app.labelInput,
        "typed input should survive, or the control should warn before discarding it"
      ).toHaveValue("Half-typed label");
    }
  );

  test(
    "clears and closes the form after a successful add",
    { annotation: [{ type: "spec", description: "R4" }] },
    async ({ app }) => {
      await app.open();
      await app.addTimezone("Head Office", "America/New_York");

      await expect(app.form).toBeHidden();

      await app.openForm();
      await expect(app.labelInput).toHaveValue("");
      await expect(app.timezoneSelect).toHaveValue("");
    }
  );

  test(
    "persists added records across a reload",
    { annotation: [{ type: "spec", description: "R4" }] },
    async ({ app }) => {
      await app.open();
      await app.addTimezone("Head Office", "America/New_York");
      await app.addTimezone("Islands", "Pacific/Honolulu");

      await app.reload();

      const zones = (await app.readRows()).map((r) => r.zone);
      expect(zones).toContain("America/New_York");
      expect(zones).toContain("Pacific/Honolulu");
    }
  );

  test(
    "picker labels match the abbreviation actually in force today",
    {
      tag: "@known-bug",
      annotation: [
        { type: "spec", description: "R4" },
        {
          type: "issue",
          description: "ISSUE-12 - zones are labelled 'Standard Time' year-round",
        },
      ],
    },
    async ({ app, page }) => {
      await app.open();
      await app.openForm();

      const options = await app.timezoneSelect
        .locator("option")
        .evaluateAll((els) =>
          els
            .map((e) => ({
              text: (e as HTMLOptionElement).textContent ?? "",
              value: (e as HTMLOptionElement).value,
            }))
            .filter((o) => o.value !== "")
        );

      const mismatches: string[] = [];
      for (const { text, value } of options) {
        const abbreviation = await page.evaluate(
          ({ zone }) =>
            new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
              .formatToParts(new Date())
              .find((p) => p.type === "timeZoneName")!.value,
          { zone: value }
        );
        const saysStandard = /Standard Time/i.test(text);
        const isDaylight = /D/.test(abbreviation) && abbreviation.length >= 3;
        if (saysStandard && isDaylight) {
          mismatches.push(`"${text}" is currently ${abbreviation}`);
        }
      }

      expect(mismatches, mismatches.join("; ")).toEqual([]);
    }
  );
});
