# Hiive QA Take-Home - Time Keeper

QA assessment and automated coverage for the `timezone-app` in
[`hiivemarkets/tech-interview`](https://github.com/hiivemarkets/tech-interview/tree/main/timezone-app).

## Release recommendation: **No-go**

Four of the five stated requirements are unmet, and the application destroys user
data during ordinary use. I would not ship this build.

| Req | Status | |
|---|---|---|
| R1 - see the current time in each timezone | **Partly met** | Times are correct at load, then frozen ([05](docs/ISSUES.md#issue-05)); both data columns are hidden below 1024px ([09](docs/ISSUES.md#issue-09)) |
| R2 - auto-create a local record marked "You" | **Not met** | Adding your own zone destroys the record ([14](docs/ISSUES.md#issue-14)); restoring it wipes every other timezone ([04](docs/ISSUES.md#issue-04)) |
| R3 - sort by current time, earliest first | **Not met** | Sorted alphabetically by label ([01](docs/ISSUES.md#issue-01)) |
| R4 - add any timezone, any label | **Not met** | Six US zones only, so the spec's own CEST example is impossible ([06](docs/ISSUES.md#issue-06)) |
| R5 - delete any row except "You" | **Not met** | The "You" row can be deleted ([02](docs/ISSUES.md#issue-02)); deleting one row can delete others ([03](docs/ISSUES.md#issue-03)) |

### The four risks that decide the release

Ranked by what they cost a user, not by how many requirements they touch.

1. **Adding a timezone silently destroys an existing one.** Two paths: adding a zone
   already in the table replaces that record ([07](docs/ISSUES.md#issue-07)), and
   adding the zone you are in replaces the protected "You" record
   ([14](docs/ISSUES.md#issue-14)). No warning, no undo. *Add* is the last operation
   anyone expects to remove data.
2. **Deleting one row can delete others.** Deletion matches on label, and labels are
   free text. Two rows named "Team" both vanish; a row named "Local" takes the "You"
   row with it, emptying the table ([03](docs/ISSUES.md#issue-03)).
3. **A reload can wipe everything.** When the local record is missing, the app
   replaces the whole table rather than adding it back
   ([04](docs/ISSUES.md#issue-04)). The trigger is persisted data containing no
   record marked as local, which defect 2 makes easy to produce.
4. **The clock does not tick** ([05](docs/ISSUES.md#issue-05)). Every other defect
   announces itself. A stale clock looks exactly like a working one, so an hour later
   the user confidently reads a wrong time - in an app whose only job is telling the
   time.

**Highest-leverage fix:** records have no stable identity. Delete addresses them by
label, add addresses them by zone; both are user-controlled and non-unique.
A generated id per record fixes defects 03, 07 and 14 outright and makes 02 safe to
fix. It does **not** fix 04, which is a separate whole-array replacement bug, nor 01,
05, 06, 08, 09 or 15. There is no single root cause: the defects originate from
several independent implementation decisions, listed in
[Root causes](docs/ISSUES.md#root-causes).

### Where the evidence is

| | |
|---|---|
| **[docs/ISSUES.md](docs/ISSUES.md)** | 17 defects: repro steps, expected vs actual, root cause with line references, suggested fix. Also filed as GitHub Issues. |
| **[docs/TEST-PLAN.md](docs/TEST-PLAN.md)** | Strategy, layering rationale, determinism controls, coverage matrix, honest gaps. |
| **[timezone-app/e2e/](timezone-app/e2e)** | 59 Playwright tests per browser, Chromium and Firefox. |
| **[CI](.github/workflows/e2e.yml)** | Blocking regression gate plus a non-blocking known-defect lane. |

Of the 17, **9 are failures against R1-R5** and **8 came from exploratory testing
beyond them** - malformed persisted data, cross-tab overwrite, validation gaps, zone
labelling, form ergonomics and debug logging. The split is strict: a finding only
counts against a requirement when it stops that requirement being met as written, so
the direct-failure count is not padded with quality gaps that leave the requirement
satisfiable.

## Running it

Node 20+.

```bash
cd timezone-app
npm ci
npx playwright install chromium firefox

npm run e2e          # full suite, Chromium + Firefox
npm run e2e:gate     # 32 regression tests per browser, all passing
npm run e2e:report   # open the HTML report
```

Playwright builds the app and serves it on port 3100 itself, so nothing needs to be
running first. To drive the app by hand, `npm run dev` still works as the original
README describes.

## Why a large number of tests fail

Deliberately. **The tests assert the specification, not the app's current behaviour.**

Tests written to pass against today's build would encode 17 defects as the contract,
and every bug fix would turn CI red. Each failing test is instead an executable defect
report, tagged `@known-bug` and annotated with its issue number.

Two lanes keep that from burying genuinely new breakage:

- **`npm run e2e:gate`** - 32 tests per browser, all green. A failure means a change
  broke working behaviour. **This is the merge blocker.**
- **`npm run e2e:known-bugs`** - the tagged tests, each failing as expected.
  Non-blocking. One of them is Chromium-only and is skipped on Firefox rather than
  reported as a pass, so a browser without the defect never emits a false
  fix-has-landed signal. CI inspects each result individually and warns by name when
  a test starts passing, which is the cue to close an issue and drop its tag.

The tag reflects observed status, never intent. Three sorting tests are annotated with
ISSUE-01 but currently pass - alphabetical order coincides with time order for their
data - so they stay in the gate where they protect real behaviour.

## Notes on the test design

Full reasoning in [docs/TEST-PLAN.md](docs/TEST-PLAN.md). What mattered most:

**Browser-level tests fit this codebase, not every codebase.** The app is one client
component with no API and no exported units, its risk sits in `Intl`, `localStorage`
and hydration, and the assignment fixes it as read-only. In a production system most
of what these tests assert - the comparator, the formatter, storage migration - would
be unit and component tests, with E2E reserved for a handful of journeys.

**Determinism first.** Timezone and locale are pinned, the clock is frozen before
every navigation, expected times are computed from `Intl` rather than hard-coded, and
tests run against a production build rather than the dev server.

**Two false greens were found in this suite and fixed** - one seeding race, one
assertion satisfied by server-rendered markup before hydration crashed the page. Both
are written up rather than quietly corrected, because a test that passes against a
broken app is worse than no test.

**Cross-browser coverage earned its place.** Firefox surfaced the flakiness that led
to the production-build change, and Chromium-only behaviour turned out to be a real
defect ([17](docs/ISSUES.md#issue-17)). WebKit is a known gap, with the reason stated
in the test plan rather than glossed over.

## Layout

```
├── docs/
│   ├── ISSUES.md        17 defects, severity-ranked, with root causes
│   ├── TEST-PLAN.md     strategy, layering, coverage matrix, gaps
│   └── evidence/        screenshots referenced from the reports
├── .github/workflows/
│   └── e2e.yml          regression gate (blocking) + known-defect lane (reporting)
└── timezone-app/        the app under test, plus:
    └── e2e/
        ├── specs/       one file per requirement, plus time edge cases
        └── support/     page object, fixtures, time helpers
```

**`timezone-app/app/` is byte-for-byte identical to upstream.** The assignment asked
me to test the app, not fix it, and leaving it untouched keeps every failing test
reproducible against the original repo. Each issue names its root cause and a
suggested fix instead of applying one.

Two files outside `app/` are modified, both test infrastructure: `playwright.config.ts`
(baseURL, pinned timezone/locale, browser projects, managed production `webServer`)
and `package.json` (the `e2e:*`, `typecheck` and `start:test` scripts). The placeholder
`e2e/example.spec.ts` was replaced by the seven spec files.
