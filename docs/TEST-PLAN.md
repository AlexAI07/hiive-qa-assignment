# Test Plan - Time Keeper

## Where these tests sit

Browser-level Playwright tests carry almost all the weight here, and that is a
consequence of this codebase, not a general position on testing.

The app is a single client component with no API, no server logic and no exported
units. Its risk is concentrated in exactly the places only a browser can exercise:
`Intl` timezone resolution, `localStorage` persistence, hydration, and the user
workflows built on them. The assignment also fixes the application as read-only, so
adding seams for unit tests is not available. Given that, an E2E-heavy suite is the
honest fit.

In a production system I would not shape it this way. The mix I would expect:

| Layer | What it would own here |
|---|---|
| **Unit** | The sort comparator, the time formatter, storage read/write and migration. Pure functions, cheap, exhaustive on edge cases: DST, non-hour offsets, midnight. Most of `time-edge-cases.spec.ts` belongs here. |
| **Component** | The table and the add form in isolation - validation states, empty state, the disabled Delete control. Faster and more precise than driving the whole page. |
| **Integration / contract** | Nothing to test today: no API, no backend. The moment timezones sync to a server, the client/server contract becomes the highest-value layer. |
| **E2E** | A small set of critical journeys: first visit creates the local record, add a zone, delete a zone, data survives a reload. Not 59 tests. |
| **Production feedback** | Client error reporting would have caught [ISSUE-08](ISSUES.md#issue-08) in the field; a metric on records-per-user would have surfaced the silent deletions in 03, 07 and 14 as an unexplained drop. |

The pyramid inverts here for a specific, temporary reason. Once the app can be
changed, most of what these tests assert should move down a layer, and the E2E suite
should shrink to the journeys that genuinely need a browser.

## What the suite is for

The app does not meet its specification, which forces the first design decision:

> **Tests assert the specification, not the current behaviour.**

Tests written to pass against today's build would encode 17 defects as the contract,
and every subsequent fix would turn CI red. So a substantial number fail on `main`,
and each failure is an executable defect report tagged `@known-bug` and annotated
with its issue number.

That is only useful if it does not bury genuinely new breakage:

| Lane | Command | Today (per browser) | A failure means |
|---|---|---|---|
| **Regression gate** | `npm run e2e:gate` | 32 pass, 0 fail | A change broke working behaviour. Blocks the merge. |
| **Known bugs** | `npm run e2e:known-bugs` | 27 fail (chromium) / 26 fail + 1 skip (firefox) | Expected. Non-blocking. |
| Everything | `npm run e2e` | 59 tests per browser | Full picture. |

The `@known-bug` tag reflects **observed status, not intent**. A test annotated with
an issue but currently passing stays in the gate, because it is protecting real
behaviour today. Three sorting tests sit in exactly that position: alphabetical order
happens to coincide with time order for their data, so they pass now and would catch
a regression, while the adversarial cases prove the defect.

## How CI handles known defects

Two jobs in [`e2e.yml`](../.github/workflows/e2e.yml):

- **`regression-gate`** runs the untagged tests on Chromium and Firefox. It blocks.
- **`known-bugs`** runs the tagged tests. The step is expected to fail, so the job
  reports red; `continue-on-error` at the **job** level keeps the overall run green.

Being precise about what the second job can detect, because an earlier version of
this document overstated it:

The suite exit code only says whether the whole lane passed, which is useless when
the lane is expected to fail. So the job writes a JSON report and a follow-up step
inspects **each result individually**, emitting a `::warning::` naming any known-bug
test that has started passing. That is the fix-landed signal: close the issue, drop
the `@known-bug` tag, and the test moves into the gate permanently.

Verified both ways: against today's build it reports "all known-bug tests still
fail"; with a passing result injected it names that specific test.

**Why not `test.fail()`?** Playwright's expected-failure annotation gives per-test
detection natively and would remove the custom step. It was rejected because it
reports expected failures as *passes*: `npm run e2e` would print all-green against an
app with four Critical defects. The visible red is evidence, and evidence is the
point of this submission. The two-lane split keeps that while still giving per-test
precision.

## Determinism

A timezone app tested naively is a flaky-test generator. Five sources are closed:

| Risk | Control |
|---|---|
| Machine timezone leaks into results | `timezoneId` pinned in config; overridden per-spec where the local zone *is* the subject |
| Locale changes time formatting | `locale: "en-US"` pinned alongside it |
| Wall-clock time moves mid-run | `page.clock.setFixedTime()` before every navigation |
| Assertions rot into tautologies | Expected times are **computed** from `Intl` at the same instant, never hard-coded |
| Dev-server compilation under load | Tests run against a **production build** on port 3100, not `next dev` |

`FIXED_NOW` is `2026-08-19T13:30:00Z`: inside DST, no zone under test wraps midnight,
and the zones land on distinct hours (03:30 Honolulu, 06:30 Vancouver, 09:30 New York,
15:30 Paris, 22:30 Tokyo) so an off-by-one-hour regression cannot hide. Tests that
need a different instant - midnight, noon, a DST boundary - pass one explicitly.

One test opts out of the frozen clock: *"the displayed time keeps up with the passing
of time"* needs `clock.install()` and `fastForward()`, because a frozen clock cannot
detect a clock that fails to tick. That is why the page object exposes `open()` and
`openWithControllableClock()` separately rather than hiding the choice.

## Two false-green defects found in this suite

Both were found by running the suite differently, and both are recorded because they
are the failure mode the suite exists to prevent.

**1. Seeding raced the app's own writes.** The malformed-storage tests originally
loaded the app, wrote a bad value into `localStorage`, reloaded, and asserted. The app
persists its state from an effect, so it could overwrite the seeded value between the
write and the reload - and the reload then found healthy data and the test passed.
Fixed by seeding through `page.addInitScript`, so the value is in place before any app
code runs.

**2. Asserting on server-rendered markup before hydration.** Those same tests then
asserted `expect(table).toBeVisible()`. The server-rendered HTML already contains an
empty `<table>`, and the crash happens during hydration - so under parallel load the
assertion landed in the gap and passed against a completely blank page. Surfaced by
the Firefox run, where the window is wider. Fixed by asserting on the recovered local
record, which only exists after hydration.

A test that passes against an app which has not been fixed is worse than no test: it
is a false all-clear on a data-loss defect.

## Cross-browser coverage

Chromium and Firefox both run the full suite. This matters more than usual here
because every requirement depends on `Intl`, which each engine implements over its
own ICU integration.

It has already paid for itself twice:

- **[ISSUE-17](ISSUES.md#issue-17)** exists only on Chromium, which reports
  `Asia/Calcutta` where Firefox reports `Asia/Kolkata`. A Chromium-only suite would
  have shipped it unnoticed.
- **The flakiness above** surfaced on Firefox first, which is what led to testing
  against a production build.

Results are otherwise identical across the two engines, which is the useful outcome:
one browser-specific defect, and no divergence anywhere else.

**WebKit is not included, and that is a real gap.** Its Linux build needs system
libraries (`libicu74`, `libxml2`, `libevent`, `libwoff2`, others) that need root to
install, which was not available in the environment this was built in. Rather than
commit a browser I had never executed and let CI discover the result, it is left out.
Adding it is a one-line config change plus `npx playwright install --with-deps webkit`,
and it should be done - Safari is a real share of traffic, and JavaScriptCore's `Intl`
is the third independent implementation, so it is exactly where a fourth surprise
would come from.

The Chromium-only defect is handled with `test.skip(browserName !== "chromium", ...)`
rather than a broad tag, so the known-bug lane stays honest: a browser where the
defect does not exist must not emit a "fix has landed" signal.

## Structure

```
e2e/
├── specs/
│   ├── current-time.spec.ts      R1 - the time shown per zone
│   ├── local-record.spec.ts      R2 - the automatic "You" record
│   ├── sorting.spec.ts           R3 - ordering by current time
│   ├── add-timezone.spec.ts      R4 - adding records
│   ├── delete-timezone.spec.ts   R5 - deleting records
│   ├── time-edge-cases.spec.ts   midnight, noon, DST, non-hour offsets
│   └── resilience.spec.ts        persisted-state robustness
└── support/
    ├── TimeKeeperPage.ts         page object
    ├── fixtures.ts               page object + error collectors
    ├── time.ts                   FIXED_NOW and Intl-derived expectations
    └── types.ts
```

One spec file per requirement, so a red build names the broken requirement before
anyone opens a report.

Three conventions worth flagging:

- **Rows are addressed by timezone, never by label.** Labels are not unique - that is
  [ISSUE-03](ISSUES.md#issue-03) - so a label-based locator would rest on the
  assumption under test and could silently match the wrong row.
- **`addTimezone` settles on the app's own success signals** (row visible, record in
  storage) before returning. Clicking Save is not the same as the record existing.
- **Uncaught exceptions are collected on every test** via fixtures. An app that throws
  while still rendering something passes DOM assertions happily;
  [ISSUE-08](ISSUES.md#issue-08) was found by watching `pageerror`.

## Coverage

Per browser. Chromium shown; Firefox is identical except the Chromium-only defect,
which is skipped there.

| Spec file | Tests | Pass | Fail | Issues |
|---|---:|---:|---:|---|
| `add-timezone.spec.ts` | 12 | 4 | 8 | 06, 07, 10, 11, 12, 16 |
| `local-record.spec.ts` | 11 | 9 | 2 | 04, 14 |
| `time-edge-cases.spec.ts` | 10 | 8 | 2 | 01, 17 |
| `delete-timezone.spec.ts` | 8 | 3 | 5 | 02, 03 |
| `resilience.spec.ts` | 7 | 2 | 5 | 08, 13, 15 |
| `current-time.spec.ts` | 6 | 3 | 3 | 05, 09 |
| `sorting.spec.ts` | 5 | 3 | 2 | 01 |
| **Total** | **59** | **32** | **27** | **17** |

Every failure maps to a numbered issue. There are no unexplained reds.

### Cases chosen to be hard to pass by accident

- **Sorting is tested with labels whose alphabetical order is the reverse of their
  time order** (`Alpha`/09:30 vs `Zulu`/03:30). A comparator on the wrong field cannot
  fluke it.
- **Ordering is also tested across midnight** (11 PM, 12 AM, 1 AM). This defeats the
  obvious wrong fix for [ISSUE-01](ISSUES.md#issue-01) - sorting the rendered
  `"12:00 AM"` string, which looks right and puts midnight last.
- **The local record is parametrised over Paris, Tokyo, Honolulu, Kolkata, Kathmandu
  and St John's**, so a North-America-shaped or whole-hour-offset assumption fails
  rather than passing by geography.
- **R4 is tested with the specification's own example**, "Europe HQ" in CEST. When a
  spec supplies an example, that example is a test case.
- **Expected times are derived from `Intl`, not typed in**, so the assertions still
  mean something if the app's format changes.
- **Storage is seeded directly** for resilience cases - the only way to reach states
  the UI cannot produce but the real world can.

## Known gaps

- **WebKit.** Covered above. The largest single gap.
- **No unit or component layer**, for the reasons at the top. The edge-case specs are
  the clearest candidates to move down once the app is editable.
- **No storage-quota test.** Behaviour when `localStorage` is full is untested. Not
  reproduced, and deliberately not filed as a defect.
- **No accessibility audit.** Locators are role-based, so a control a screen reader
  cannot find fails the suite, but that is a side effect rather than coverage. The
  header/body column mismatch in [ISSUE-09](ISSUES.md#issue-09) was found this way.
- **No visual regression or performance testing.** Neither is a material risk for a
  table this size.
- **`console.log` assertions are strict** - `resilience.spec.ts` fails on any
  `console.log`. Deliberate for [ISSUE-13](ISSUES.md#issue-13), but it needs relaxing
  to a filter if legitimate logging is ever introduced.
