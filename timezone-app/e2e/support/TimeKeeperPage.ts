import { Page, Locator, expect } from "@playwright/test";
import { TimezoneRow } from "./types";
import { FIXED_NOW } from "./time";

/**
 * Page object for the Time Keeper table.
 *
 * Locators are role/label based wherever the markup allows it, so the suite keeps
 * working through Tailwind class churn and doubles as a light accessibility check:
 * if `getByRole` can't find a control, neither can a screen reader.
 */
export class TimeKeeperPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly table: Locator;
  readonly rows: Locator;
  readonly addTimezoneButton: Locator;
  readonly form: Locator;
  readonly labelInput: Locator;
  readonly timezoneSelect: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Time Keeper" });
    this.table = page.getByRole("table");
    this.rows = page.locator("tbody tr");
    this.addTimezoneButton = page.getByRole("button", { name: "Add timezone" });
    this.form = page.locator("form");
    this.labelInput = page.getByLabel("Label");
    this.timezoneSelect = page.getByLabel("Location");
    this.saveButton = page.getByRole("button", { name: "Save" });
  }

  /**
   * Opens the app with the clock frozen at FIXED_NOW.
   *
   * Freezing rather than mocking timers keeps `Date.now()` deterministic without
   * stalling React's scheduler, which is what most time-sensitive assertions want.
   */
  async open(): Promise<void> {
    await this.page.clock.setFixedTime(FIXED_NOW);
    await this.goto();
  }

  /** Opens the app with the clock frozen at an arbitrary instant. */
  async openAt(instant: Date): Promise<void> {
    await this.page.clock.setFixedTime(instant);
    await this.goto();
  }

  /** Moves the frozen clock and reloads, for tests that span a DST boundary. */
  async reloadAt(instant: Date): Promise<void> {
    await this.page.clock.setFixedTime(instant);
    await this.reload();
    await expect(this.rows.first()).toBeVisible();
  }

  /**
   * Opens the app with fully faked timers, so the test can advance time itself.
   * Only needed by specs that assert the display *changes* as time passes.
   */
  async openWithControllableClock(): Promise<void> {
    await this.page.clock.install({ time: FIXED_NOW });
    await this.goto();
  }

  private async goto(): Promise<void> {
    await this.page.goto("/");
    await expect(this.heading).toBeVisible();
    // The local row is written by an effect after hydration; waiting on it here
    // stops every downstream test from having to race the first paint.
    await expect(this.rows.first()).toBeVisible();
  }

  /** Advances the faked clock, e.g. "45:00" for 45 minutes. */
  async advanceClockBy(duration: string): Promise<void> {
    await this.page.clock.fastForward(duration);
  }

  async reload(): Promise<void> {
    await this.page.reload();
    await expect(this.heading).toBeVisible();
  }

  /** Reads the whole table the way a user would see it. */
  async readRows(): Promise<TimezoneRow[]> {
    return this.rows.evaluateAll((trs) =>
      trs.map((tr) => {
        const cells = tr.querySelectorAll("td");
        const rawLabel = (cells[0] as HTMLElement)?.innerText ?? "";
        return {
          label: rawLabel.replace(/\(You\)/, "").replace(/\s+/g, " ").trim(),
          isLocal: rawLabel.includes("(You)"),
          zone: (cells[1] as HTMLElement)?.innerText.trim() ?? "",
          time: (cells[2] as HTMLElement)?.innerText.trim() ?? "",
          deleteDisabled:
            (cells[3]?.querySelector("button") as HTMLButtonElement)?.disabled ??
            false,
        };
      })
    );
  }

  /** The single row marked "(You)". */
  localRow(): Locator {
    return this.rows.filter({ hasText: "(You)" });
  }

  /** Rows are addressed by zone, not label - labels are not unique. */
  rowForZone(zone: string): Locator {
    return this.rows.filter({ has: this.page.getByRole("cell", { name: zone, exact: true }) });
  }

  rowsWithLabel(label: string): Locator {
    return this.rows.filter({ hasText: label });
  }

  /**
   * Ensures the form is open.
   *
   * "Add timezone" is a toggle, not an open button, so clicking it unconditionally
   * closes a form that is already showing (and silently discards anything typed
   * into it - see the observations in docs/ISSUES.md). Guarding on visibility keeps
   * the helper safe to call from anywhere.
   */
  async openForm(): Promise<void> {
    if (!(await this.form.isVisible())) {
      await this.addTimezoneButton.click();
    }
    await expect(this.form).toBeVisible();
  }

  /**
   * Fills and submits the add-timezone form.
   *
   * `zone` is matched against the option *value* (the IANA id) so specs read in
   * terms of real zones rather than the picker's display strings.
   */
  async addTimezone(
    label: string,
    zone: string,
    opts: { expectRow?: boolean } = {}
  ): Promise<void> {
    const { expectRow = true } = opts;

    await this.openForm();
    await this.labelInput.fill(label);
    await this.timezoneSelect.selectOption(zone);
    await this.saveButton.click();

    if (!expectRow) return;

    // Settle on the app's own success signals before returning. Clicking Save is
    // not the same as the record existing: the row appears on the next render and
    // the write to storage happens in an effect after that. A test that reloads
    // straight after the click can beat the write and lose the record - which is
    // exactly how "persists added records across a reload" flaked on Firefox under
    // parallel load while passing in isolation.
    await expect(this.rowForZone(zone)).toBeVisible();
    await expect
      .poll(async () => (await this.readStorage()) ?? "", {
        message: `record for ${zone} should be persisted before the test continues`,
      })
      .toContain(zone);
  }

  /** Submits whatever is currently in the form without filling it first. */
  async submitForm(): Promise<void> {
    await this.saveButton.click();
  }

  async availableZoneValues(): Promise<string[]> {
    await this.openForm();
    const values = await this.timezoneSelect
      .locator("option")
      .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
    return values.filter((v) => v !== "");
  }

  async deleteRowForZone(zone: string): Promise<void> {
    await this.rowForZone(zone).getByRole("button", { name: /^Delete/ }).click();
  }

  deleteButtonForZone(zone: string): Locator {
    return this.rowForZone(zone).getByRole("button", { name: /^Delete/ });
  }

  localDeleteButton(): Locator {
    return this.localRow().getByRole("button", { name: /^Delete/ });
  }

  /**
   * Opens the app without waiting for the table to appear.
   *
   * Needed by resilience tests, where the expected-but-unmet outcome is that the
   * app renders at all - waiting on a row first would fail in setup and hide the
   * assertion that is actually being made.
   */
  async openRaw(): Promise<void> {
    await this.page.clock.setFixedTime(FIXED_NOW);
    await this.page.goto("/");
  }

  /**
   * Seeds persisted state so it is in place *before* any app code runs on the next
   * navigation.
   *
   * Writing the value into a live page instead is a race: the app persists its own
   * state on a effect, so it can overwrite the seeded value between the write and
   * the reload. That race made the malformed-storage tests intermittently pass
   * against an app that had not been fixed - the worst kind of green.
   */
  async seedStorageBeforeLoad(raw: string): Promise<void> {
    await this.page.addInitScript((value) => {
      window.localStorage.setItem("timekeeperdb", value as string);
    }, raw);
  }

  async readStorage(): Promise<string | null> {
    return this.page.evaluate(() => window.localStorage.getItem("timekeeperdb"));
  }
}
