# Defect Report - Time Keeper

17 issues found. 9 are failures against the five stated requirements; 8 came out of
exploratory testing beyond them. Each is reproducible from a clean browser profile
and is covered by at least one failing test in `timezone-app/e2e/specs/`.

The split is deliberately strict. A finding is only counted against a requirement
when it stops that requirement being met as written. Validation gaps, picker
labelling and form ergonomics are real defects, but R4 asks that the user be able to
add a record with any label - and they can. Those sit under exploratory findings
rather than being stretched to inflate the requirement-failure count.

**Build under test:** `hiivemarkets/tech-interview` @ `main`, `timezone-app/`
**Environment:** Chromium 145 and Firefox 146 (Playwright 1.58.2), against a
Next.js 13.4.19 **production build** served on port 3100, Linux x64
**Browser timezone:** `America/Vancouver` unless a step says otherwise
**Reference instant:** `2026-08-19T13:30:00Z` - inside North American DST, and far
enough from midnight that no zone under test wraps the date

## Severity scale

Severity is impact x likelihood, not "how many requirements does it break". A
requirement violation the user can see and work around is not the same as one that
destroys their data without telling them.

| | Meaning |
|---|---|
| **Critical** | Data the user created is destroyed, silently, by an ordinary action. Release blocker. |
| **High** | A core requirement is materially broken, or a primary workflow shows incorrect data. |
| **Medium** | Degraded functionality or a meaningful usability gap with a workaround. |
| **Low** | Cosmetic, hygiene, or minor correctness. No functional impact. |

Two issues are deliberately rated below their raw impact because a precondition
gates them: [ISSUE-08](#issue-08) needs storage to be corrupted by something outside
the app, and [ISSUE-15](#issue-15) needs two tabs open at once. Both would be
Critical if their trigger were routine, and ISSUE-15 should be re-rated upward if
usage data shows multi-tab is common.

## Summary

### A. Failures against the stated requirements

Nine defects that stop a requirement being met as written.

| ID | Title | Severity | Req | Covering test |
|---|---|---|---|---|
| [03](#issue-03) | Deleting one row deletes every row sharing its label | Critical | R5 | `delete-timezone.spec.ts` |
| [04](#issue-04) | Recreating the local record wipes every saved timezone | Critical | R2 | `local-record.spec.ts` |
| [07](#issue-07) | A second record for the same zone silently replaces the first | Critical | R4 | `add-timezone.spec.ts` |
| [14](#issue-14) | Adding the timezone you are already in destroys the "You" record | Critical | R2, R5 | `local-record.spec.ts` |
| [01](#issue-01) | Table is sorted alphabetically by label, not by current time | High | R3 | `sorting.spec.ts`, `time-edge-cases.spec.ts` |
| [02](#issue-02) | The "You" row can be deleted | High | R5 | `delete-timezone.spec.ts` |
| [05](#issue-05) | Displayed times are frozen at page load | High | R1 | `current-time.spec.ts` |
| [06](#issue-06) | Only six US zones selectable; the spec's own CEST example is impossible | High | R4 | `add-timezone.spec.ts` |
| [09](#issue-09) | Timezone and time columns are hidden below 1024px | High | R1 | `current-time.spec.ts` |

[ISSUE-09](#issue-09) is included because the requirement is to *see* the current
time, and below 1024px it cannot be seen at all. The rest are direct contradictions
of the requirement text.

### B. Additional findings from exploratory testing

Eight defects outside the five requirements. Each is real and reachable by a user;
none of them stops a stated requirement from being met.

| ID | Title | Severity | Area | Covering test |
|---|---|---|---|---|
| [08](#issue-08) | Malformed saved data renders a permanently blank page | High | resilience | `resilience.spec.ts` |
| [15](#issue-15) | A second tab silently overwrites timezones added in the first | High | concurrency | `resilience.spec.ts` |
| [10](#issue-10) | Whitespace-only labels are accepted | Medium | input validation | `add-timezone.spec.ts` |
| [11](#issue-11) | Invalid submissions fail silently | Medium | validation UX | `add-timezone.spec.ts` |
| [16](#issue-16) | Reopening the add form silently discards typed input | Medium | form ergonomics | `add-timezone.spec.ts` |
| [12](#issue-12) | Picker says "Standard Time" while DST is in force | Low | zone labelling | `add-timezone.spec.ts` |
| [13](#issue-13) | Debug `console.log` runs on every render | Low | hygiene | `resilience.spec.ts` |
| [17](#issue-17) | Legacy timezone alias shown instead of the modern name | Low | zone labelling | `time-edge-cases.spec.ts` |

Why these are not counted as requirement failures: R4 asks that the user be able to
add a record with any timezone and any label. Whitespace labels (10), silent
validation (11), a discarded draft (16) and a mislabelled picker option (12) are all
quality gaps that leave that ability intact - the record still gets added, and the
displayed time is still correct. [ISSUE-17](#issue-17) likewise does not stop R2: the
local record is created and marked "You", it just prints a deprecated name for the
zone.

## Root causes

There is no single root cause. The defects originate from several independent
implementation decisions:

| Root cause | Location | Issues |
|---|---|---|
| Comparator sorts on `label` instead of time | `page.tsx:150-155` | 01 |
| Delete matches records by label, which is not unique | `page.tsx:189-191` | 03 |
| Local row's Delete control is never disabled or guarded | `page.tsx:286-292` | 02 |
| Local-record effect **replaces** the array instead of appending | `page.tsx:145` | 04 |
| Add **deduplicates by zone**, stripping any existing row for it | `page.tsx:174` | 07, 14 |
| Time computed during render with nothing to trigger a re-render | `page.tsx:278` | 05 |
| Hard-coded six-entry zone list with hand-written display names | `page.tsx:22-29` | 06, 12 |
| `JSON.parse` with no error handling or shape validation | `page.tsx:59` | 08 |
| Whole-array write with no cross-tab reconciliation | `page.tsx:65-67` | 15 |
| `hidden ... lg:table-cell` on the two data columns | `page.tsx:267,275` | 09 |
| Validation neither trims nor surfaces an error | `page.tsx:165` | 10, 11 |
| Toggle handler discards form state | `page.tsx:208-214` | 16 |
| Zone id rendered raw, whatever the engine returns | `page.tsx:270` | 17 |
| Debug statement left in | `page.tsx:130` | 13 |

**The one systemic theme worth acting on:** records have no stable identity. Delete
addresses them by `label`, add addresses them by `zone`, and both are user-controlled
and non-unique. Introducing a generated id per record fixes **03, 07 and 14** outright
and makes **02** safe to fix without a label collision reappearing later.

It does **not** fix the rest. In particular [ISSUE-04](#issue-04) is whole-array
replacement and stays broken with ids in place; 01, 05, 06, 08, 09 and 15 are
unrelated. Fixing identity is the highest-leverage single change available, not a
cure-all.

<a name="issue-01"></a>
## ISSUE-01 - Table is sorted alphabetically by label, not by current time

**Severity:** High · **Requirement:** R3 · **Component:** table ordering

The single sorting requirement is not implemented. The comparator sorts on `label`,
so the order the user sees carries no information about time at all.

**Steps to reproduce**
1. Open the app in a browser set to `America/Vancouver`.
2. Add `Alpha` / Eastern Standard Time.
3. Add `Zulu` / Hawaii-Aleutian Standard Time.

**Expected** - earliest current time first:

| # | Label | Time |
|---|---|---|
| 1 | Zulu | 3:30 AM |
| 2 | Local (You) | 6:30 AM |
| 3 | Alpha | 9:30 AM |

**Actual** - alphabetical by label, which here is the exact reverse:

| # | Label | Time |
|---|---|---|
| 1 | Alpha | 9:30 AM |
| 2 | Local (You) | 6:30 AM |
| 3 | Zulu | 3:30 AM |

**Evidence:** `docs/evidence/02-sort.png`

**Root cause:** `app/page.tsx:150-155` - the comparator comes from a label sort that
was never switched over to time.

**Note for whoever picks this up:** sorting on the rendered `"3:30 AM"` string will
appear to work and then fail on 12-hour wraparound (`12:30 AM` sorts before `1:30 AM`
lexically but is earlier in real terms - and `9:30 PM` sorts before both). Sort on
minutes-since-midnight in the target zone; `e2e/support/time.ts:minutesOfDayIn` has a
working implementation. Also note `timezones.sort()` mutates React state in place -
worth fixing in the same pass.

---

<a name="issue-02"></a>
## ISSUE-02 - The "You" row can be deleted

**Severity:** High · **Requirement:** R5 · **Component:** delete

R5 says the "You" record is the one row that cannot be deleted. Its Delete button is
fully live.

**Steps to reproduce**
1. Open the app with no saved data.
2. Click **Delete** on the `Local (You)` row.

**Expected:** the control is disabled and the row is unaffected.
**Actual:** the row is removed. With the local record gone, the table can be emptied
completely - and reloading then triggers [ISSUE-04](#issue-04).

**Evidence:** `docs/evidence/01-initial.png` - the rendered button carries no
`disabled` attribute.

**Root cause:** `app/page.tsx:286-292`. The styling for the disabled state is already
present at line 289 (`disabled:cursor-not-allowed disabled:opacity-30`), so the
intent was clearly there - the `disabled={tz.isLocal}` prop is simply missing. That
this shipped with the styling but not the behaviour suggests it was never exercised
manually.

**Fix must cover both layers:** disabling the button alone still leaves `handleDelete`
callable; guard inside the handler too, so a future refactor of the button cannot
silently reopen the hole.

---

<a name="issue-03"></a>
## ISSUE-03 - Deleting one row deletes every row sharing its label

**Severity:** Critical · **Requirement:** R5 · **Component:** delete · **Data loss**

Deletion matches on label text. Labels are free-text and not unique, so one click can
remove rows the user never selected.

**Steps to reproduce - A: collateral deletion**
1. Add `Team` / Central Standard Time.
2. Add `Team` / Mountain Standard Time.
3. Click **Delete** on the Central row only.

**Expected:** the Central row goes; the Mountain row stays.
**Actual:** both rows disappear.

**Steps to reproduce - B: the whole table**
1. From a clean profile, add `Local` / Eastern Standard Time.
   (`Local` is the label the app itself gives the "You" row.)
2. Click **Delete** on the Eastern row.

**Expected:** one row removed, `Local (You)` untouched.
**Actual:** the table is emptied - both the new row and the protected "You" row.

Case B needs no unusual input: "Local" is an ordinary word, and the app chose it.

**Root cause:** `app/page.tsx:189-191` filters on `timezone.label !== labelToRemove`.

**Fix:** give each record a stable unique id at creation and delete by id. This also
resolves [ISSUE-07](#issue-07) and removes the `key={index}` fragility noted in the
appendix.

---

<a name="issue-04"></a>
## ISSUE-04 - Recreating the local record wipes every saved timezone

**Severity:** Critical · **Requirement:** R2 · **Component:** persistence · **Data loss**

When the app finds no local record on start-up it does not *add* one - it **replaces
the entire table** with one.

**Steps to reproduce**
1. Add `Alpha` / Eastern Standard Time and `Beta` / Central Standard Time.
2. Delete the `Local (You)` row (possible today - see [ISSUE-02](#issue-02)).
3. Reload the page.

**Expected:** the local record is restored alongside `Alpha` and `Beta` - three rows.
**Actual:** one row. `Alpha` and `Beta` are permanently gone, overwritten in
`localStorage`. There is no undo and no warning.

**Root cause:** `app/page.tsx:145` - `setTimezones([localTimezone])` discards the
existing array instead of appending to it. The effect at line 132 runs with a `[]`
dependency list, so this fires on every mount where the record is absent.

**Reachable without ISSUE-02.** The trigger is simply persisted data that contains no
record marked `isLocal`. That state has been reproduced directly by seeding storage
(see `local-record.spec.ts`), independently of how it arose. ISSUE-02 makes it easy to
reach through the UI, but fixing 02 does not fix this.

**Fix:** `setTimezones((prev) => [...prev, localTimezone])`.

**Already flagged by the project's own linter.** `npm run lint` reports
`react-hooks/exhaustive-deps` on this effect (`page.tsx:146`) - the empty dependency
array hides that it closes over `timezones`. The warning is the defect, and it was
present before I started.

---

<a name="issue-05"></a>
## ISSUE-05 - Displayed times are frozen at page load

**Severity:** High · **Requirement:** R1 · **Component:** time rendering

The times are computed once during render and never recomputed. The table shows the
time it *was* when the page loaded, with nothing on screen to say so.

**Steps to reproduce**
1. Open the app and note the time on the `Local (You)` row.
2. Leave the tab open for 45 minutes without reloading.

**Expected:** the time advances at least once a minute.
**Actual:** unchanged. Verified deterministically by advancing a faked browser clock
45 minutes - the rendered value did not move.

This is the app's entire purpose, and the failure is silent: a stale clock looks
exactly like a working one. A user glancing at it an hour later reads a wrong time
with full confidence - the worst shape a defect can take.

**Root cause:** `app/page.tsx:278` calls `getBrowserTime(tz.zone)` during render with
no interval to trigger re-renders.

**Fix:** a single `setInterval` at the table level, ticking state once per second (or
aligned to the next minute boundary, which is cheaper and enough for `timeStyle:
"short"`). One timer for the table, not one per row.

---

<a name="issue-06"></a>
## ISSUE-06 - Only six US zones selectable; the spec's own CEST example is impossible

**Severity:** High · **Requirement:** R4 · **Component:** add form

R4 says "any timezone", and illustrates it with *name - "Europe HQ", timezone -
CEST*. That exact example cannot be entered.

**Steps to reproduce**
1. Click **Add timezone** and open the **Location** dropdown.

**Expected:** worldwide coverage, or at minimum a European option.
**Actual:** six options, all US: `America/New_York`, `America/Chicago`,
`America/Denver`, `America/Los_Angeles`, `America/Juneau`, `Pacific/Honolulu`.

No Europe, Asia, Africa, South America or Oceania. Even the browser's own zone is
frequently absent - a user in Vancouver gets `America/Vancouver` on the "You" row but
cannot select it for anyone else.

**Root cause:** `app/page.tsx:22-29`, a hard-coded six-entry array.

**Fix:** `Intl.supportedValuesOf("timeZone")` returns the full IANA list from the
browser with no dependency and no maintenance. It needs a searchable combobox rather
than a bare `<select>` at ~400 entries. Deriving the list also retires
[ISSUE-12](#issue-12), since the labels stop being hand-maintained.

---

<a name="issue-07"></a>
## ISSUE-07 - A second record for the same zone silently replaces the first

**Severity:** Critical · **Requirement:** R4 · **Component:** add form · **Data loss**

Adding a record for a zone already in the table deletes the existing one without
telling the user. Rated Critical rather than High because the destroyed record is
one the user deliberately created, nothing warns them, and the action that destroys
it is an *add* - the last operation anyone expects to remove data.

**Steps to reproduce**
1. Add `Head Office` / Eastern Standard Time.
2. Add `Sales Team` / Eastern Standard Time.

**Expected:** two rows. Nothing in R4 restricts a zone to one record, and tracking
several people in one zone is the app's stated purpose ("keep track of your friends'
timezones").
**Actual:** one row, labelled `Sales Team`. `Head Office` is gone. The form reports
success.

The user is not warned before or after, and the label they just replaced may have
been the only record of it.

**Root cause:** `app/page.tsx:174` - `prevTimezones.filter((tz) => tz.zone !==
newTimezone.zone)` strips any existing record for that zone before appending.

**Fix:** drop the filter and key records by unique id (see
[ISSUE-03](#issue-03)). If deduplication is genuinely wanted, it should be an explicit
"you already track this zone - replace it?" prompt, not a silent overwrite.

---

<a name="issue-08"></a>
## ISSUE-08 - Malformed saved data renders a permanently blank page

**Severity:** High · **Component:** persistence / resilience

Saved state is parsed with no error handling. Any unparseable value throws during
render, and because the throw happens on every attempt the app cannot recover - the
user sees a white page on every visit, forever.

**Steps to reproduce**
1. Open the app, then in DevTools:
   `localStorage.setItem('timekeeperdb', 'this-is-not-json')`
2. Reload.

**Expected:** the app discards the unreadable value and starts fresh.
**Actual:** completely blank page. No table, no heading, no error message. Console
shows the parse error repeatedly plus
`There was an error while hydrating... the entire root will switch to client rendering`.

**Evidence:** `docs/evidence/05-corrupt-storage.png`

Valid JSON of the wrong shape (`{}`) and arrays containing `null` or partial records
fail the same way.

**Root cause:** `app/page.tsx:59` - bare `JSON.parse(storedValue)` inside the
`useState` initializer.

**Why this is worth fixing even though a user "wouldn't do that":** they don't have
to. `localStorage` is shared with every script on the origin, survives indefinitely,
and is written to by browser extensions, a half-completed write during a crash, and
any future version of this app that changes its schema. **There is no in-app recovery
path** - the UI needed to clear the value is the UI that won't render. Recovery
requires clearing the key from DevTools; the UI itself offers no way to do it.

**Fix:** wrap the parse in `try/catch`, validate the shape, and fall back to `[]`.

---

<a name="issue-09"></a>
## ISSUE-09 - Timezone and time columns are hidden below 1024px

**Severity:** High · **Requirement:** R1 · **Component:** responsive layout

On any viewport narrower than Tailwind's `lg` breakpoint, the two columns carrying
the actual information are `display: none`. The app becomes a list of names and
Delete buttons.

**Steps to reproduce**
1. Open the app at 390×844 (iPhone 14).
2. Add any timezone.

**Expected:** the time is visible. It is the reason the app exists.
**Actual:** only **Label** and **Delete** render. The **Timezone** and **Local Time**
cells are hidden - while their `<th>` headers stay visible, so the table advertises
four columns and delivers two.

**Evidence:** `docs/evidence/04-mobile.png`

**Root cause:** `app/page.tsx:267` and `:275` - `"hidden px-3 ... lg:table-cell"` on
both `<td>`s, with no matching `hidden lg:table-cell` on the `<th>`s.

Both the header row and the body row are rendered, but two of the four body cells are
not, so the visible table has four column headings and two columns of data.

**Fix:** show both columns at all widths; if horizontal space is genuinely tight,
stack label-over-zone in the first cell rather than hiding the time. The header/body
mismatch should be fixed regardless, as it currently misleads screen readers.

---

<a name="issue-10"></a>
## ISSUE-10 - Whitespace-only labels are accepted

**Severity:** Medium · **Relates to:** R4 · **Component:** add form · **Exploratory**

**Steps to reproduce**
1. Click **Add timezone**, type three spaces into **Label**, pick any timezone, Save.

**Expected:** rejected as empty, with a message.
**Actual:** a row is created with a visually empty Label cell.

**Evidence:** `docs/evidence/03-whitespace-label.png`

The row cannot be identified, and because delete matches on label
([ISSUE-03](#issue-03)) a second such row would make both undeletable independently.

**Root cause:** `app/page.tsx:165` - `label.value === ""` does not trim.

**Fix:** trim before validating and before storing.

---

<a name="issue-11"></a>
## ISSUE-11 - Invalid submissions fail silently

**Severity:** Medium · **Relates to:** R4 · **Component:** validation UX · **Exploratory**

**Steps to reproduce**
1. Click **Add timezone**.
2. Click **Save** with both fields empty. Repeat with only one filled.

**Expected:** inline validation naming the missing field.
**Actual:** nothing at all. No row, no message, no field highlight - the form sits
there looking as though the click missed. The user's only feedback is absence.

**Root cause:** `app/page.tsx:165` - an early `return` with no error state.

**Fix:** `required` on both controls plus an inline message tied to the field via
`aria-describedby`, so the failure is announced rather than merely displayed.

---

<a name="issue-12"></a>
## ISSUE-12 - Picker says "Standard Time" while DST is in force

**Severity:** Low · **Relates to:** R4 · **Component:** zone labelling · **Exploratory**

Five of the six options are labelled "Standard Time" year-round. On the test date
(19 August, DST active) every one is wrong:

| Dropdown label | Actually in force |
|---|---|
| Eastern Standard Time | EDT |
| Central Standard Time | CDT |
| Mountain Standard Time | MDT |
| Pacific Standard Time | PDT |
| Alaska Standard Time | AKDT |
| Hawaii-Aleutian Standard Time | HST ✓ (no DST observed) |

The displayed *times* are correct - the IANA values behind the labels handle DST
properly. Only the naming is wrong. Severity is low for that reason, but in an app
whose entire job is telling people the right time, a label that contradicts the clock
next to it costs more trust than the fix costs to make.

**Root cause:** `app/page.tsx:22-29`, hand-written display strings.

**Fix:** derive labels via `Intl.DateTimeFormat(..., { timeZoneName: "short" })` so
they follow the date. Superseded entirely by the fix for [ISSUE-06](#issue-06).

---

<a name="issue-13"></a>
## ISSUE-13 - Debug `console.log` runs on every render

**Severity:** Low · **Component:** hygiene

`app/page.tsx:130` logs the full timezone array on every render of `Home`, and ships
to production.

To be precise about the blast radius: the label field is an uncontrolled input, so
typing does **not** re-render and does not log. In practice the statement fires on
mount and on each add or delete - a handful of times per session, not per keystroke.

Minor here: the data is non-sensitive and the volume is low. Worth removing anyway,
because the same reflex applied to a table holding something that matters is how
user data ends up in a console, and routine noise is where real errors get missed.

**Fix:** delete the line; add a lint rule (`no-console`, allowing `warn`/`error`) so
the next one is caught in review rather than in QA.

---

<a name="issue-14"></a>
## ISSUE-14 - Adding the timezone you are already in destroys the "You" record

**Severity:** Critical · **Requirement:** R2, R5 · **Component:** add form · **Data loss**

R5 protects the "You" row from deletion. The add form removes it anyway, through a
path that has nothing to do with the Delete button.

**Steps to reproduce**
1. Open the app in a browser set to `America/New_York`. The table shows one row,
   `Local (You)`.
2. Click **Add timezone**, label it `Work`, choose **Eastern Standard Time**, Save.

**Expected:** two rows, or a message explaining the zone is already tracked. The
`Local (You)` record survives either way.
**Actual:** one row, labelled `Work`, with no "(You)" marker. The local record is
gone. The user has just lost the row the specification says cannot be lost, by adding
something rather than deleting anything.

It compounds with [ISSUE-04](#issue-04) on the next reload: the app sees no local
record, recreates one, and overwrites the table again, so `Work` is destroyed in turn.
Two ordinary actions, and both records are gone.

**Why this is easy to hit:** it needs no unusual input. Any user in one of the six
offered zones who adds a label for their own city walks straight into it, and adding
your own zone under a friendlier name is a natural thing to do.

**Root cause:** `app/page.tsx:174` - `prevTimezones.filter((tz) => tz.zone !==
newTimezone.zone)` strips every existing row for the incoming zone before appending.
It does not exempt `isLocal` rows. This is the same line behind
[ISSUE-07](#issue-07); this is its more damaging case.

**Fix:** never remove the local record here, and address records by unique id rather
than by zone (see [ISSUE-03](#issue-03)).

---

<a name="issue-15"></a>
## ISSUE-15 - A second tab silently overwrites timezones added in the first

**Severity:** High · **Component:** persistence · **Data loss**

Each tab keeps its own copy of the table in React state and writes the entire array
back to `localStorage` on every change. Nothing reconciles the two, so the tab that
saves last wins and the other tab's work is destroyed without warning.

**Steps to reproduce**
1. Open the app in two tabs, A and B. Both load the same table.
2. In tab A, add `Added in tab A` / Eastern Standard Time.
3. In tab B, add `Added in tab B` / Central Standard Time.
4. Reload tab A.

**Expected:** both records present in both tabs.
**Actual:** `localStorage` holds only `Added in tab B` and the local record. Tab A's
entry is gone, and reloading tab A confirms it - the row the user added there has
been erased by an action they took somewhere else.

Ordering matters and is invisible to the user: tab B never saw tab A's addition
because it read storage before that write happened, so it wrote a stale array over
the top.

**Root cause:** `app/page.tsx:65-67` - the effect persists the whole `value` array
whenever it changes, with no merge, no versioning, and no `storage` event listener to
pick up changes made elsewhere.

**Fix:** listen for the `storage` event and reconcile, or read-modify-write against
current storage rather than overwriting from in-memory state. Addressing records by
unique id makes the merge tractable.

---

<a name="issue-16"></a>
## ISSUE-16 - Reopening the add form silently discards typed input

**Severity:** Medium · **Relates to:** R4 · **Component:** form ergonomics · **Exploratory**

**Add timezone** is a toggle wearing the label of an open action. It never becomes
"Cancel" or "Close", so a second click reads as harmless and instead throws away
whatever has been typed, with no prompt.

**Steps to reproduce**
1. Click **Add timezone**.
2. Type a label and pick a timezone. Do not save.
3. Click **Add timezone** again (the form closes), then once more to reopen it.

**Expected:** the entry is still there, or the user is warned before it is discarded.
**Actual:** both fields are empty.

**Root cause:** `app/page.tsx:208-214` - `onClick={() => setShowForm(!showForm)}`.
The form is unmounted, and being uncontrolled it keeps no state to restore.

**Fix:** label the control for what it does in its current state, and either preserve
the draft or confirm before discarding it. Only in-progress input is lost, which is
why this is Medium rather than higher.

---

<a name="issue-17"></a>
## ISSUE-17 - Legacy timezone alias shown instead of the modern name

**Severity:** Low · **Relates to:** R2 · **Component:** zone labelling · **Exploratory**
**Browser-specific: Chromium only**

The Timezone column prints whatever id the browser reports, and engines disagree on
whether to canonicalise deprecated IANA aliases.

**Steps to reproduce**
1. Set the browser timezone to `Asia/Kolkata`.
2. Open the app and read the Timezone column on the "You" row.

| Engine | Displayed |
|---|---|
| Chromium 145 | `Asia/Calcutta` |
| Firefox 146 | `Asia/Kolkata` |

`Asia/Kathmandu` behaves the same way, displaying as `Asia/Katmandu` on Chromium.
The **times are correct in both** - only the identifier differs.

A user in Kolkata sees their city under a name it stopped using in 1995, and sees a
different name depending on their browser. Low severity: nothing is wrong or lost,
and the app is faithfully reporting what the platform told it.

**Root cause:** `app/page.tsx:270` renders `tz.zone` raw. The value originates from
`Intl.DateTimeFormat().resolvedOptions().timeZone` at `page.tsx:137`, which Chromium
does not canonicalise.

**Fix:** map through a display-name lookup rather than showing the raw id -
`Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "long" })` gives users
something meaningful and sidesteps the alias question. This lands naturally with the
fix for [ISSUE-06](#issue-06), which replaces the hard-coded list anyway.

**Found by:** cross-engine execution. A Chromium-only suite would not have seen it.

---

## Appendix - code observations

Found while reading the source. These are **not** reproduced as user-facing failures
and have no tests. They are recorded so nobody spends time rediscovering them.

One candidate was investigated and deliberately **not** filed: a label of ~80
characters or more pushes the page into horizontal scroll, but only when it contains
no spaces. Realistic labels wrap correctly, so the trigger is an unbroken token such
as a pasted URL. Not worth a ticket at that likelihood.

| # | Observation | Location |
|---|---|---|
| A2 | The **Local Time** column header is ambiguous - it holds the time in *that row's* zone, not the viewer's. "Current Time" would read correctly. | `page.tsx:238` |
| A3 | Rows use `key={index}`. Combined with reordering and deletion, React can reuse the wrong DOM node; this will surface as visual glitches once sorting is fixed. | `page.tsx:247` |
| A4 | `timezones.sort()` mutates React state in place. The array identity does not change, so this can suppress the re-render that should follow. | `page.tsx:149` |
| A5 | `localStorage` is read in the `useState` initializer, which runs on the server as `[]` and on the client with real data - a hydration mismatch by construction. The observed hydration error under [ISSUE-08](#issue-08) is one symptom. | `page.tsx:56-63` |
| A6 | `hasLocalTimezone` tests `== 1`. Two local records would be treated as "none" and trigger the overwrite in [ISSUE-04](#issue-04). | `page.tsx:133` |
| A7 | Records cannot be edited. Correcting a typo means delete-and-recreate, which currently risks [ISSUE-03](#issue-03). Possibly out of scope, but worth a product decision. | - |
