/**
 * A single fixed instant that every time-sensitive assertion is anchored to.
 *
 * 2026-08-19T13:30:00Z was chosen deliberately: it is inside North American DST,
 * which is what exposes the "Standard Time" mislabelling in the picker (ISSUE-12),
 * and it produces times on three different calendar-adjacent hours across the
 * zones under test, so an off-by-one-hour regression cannot hide.
 *
 *   Pacific/Honolulu    03:30  (HST, no DST)
 *   America/Vancouver   06:30  (PDT)
 *   America/New_York    09:30  (EDT)
 *   Europe/Paris        15:30  (CEST)
 *   Asia/Tokyo          22:30  (JST)
 */
export const FIXED_NOW = new Date("2026-08-19T13:30:00Z");

/** The zone the browser itself reports unless a spec overrides it. */
export const DEFAULT_LOCAL_ZONE = "America/Vancouver";

/**
 * Renders the expected wall-clock string for a zone using exactly the same
 * formatting contract as the app (`toLocaleTimeString` with `timeStyle: "short"`).
 *
 * Computing the expectation rather than hard-coding "9:30 AM" means the suite
 * still asserts something real if the app changes its format, instead of
 * silently rotting into a string-equality tautology.
 */
export function expectedTimeIn(zone: string, at: Date = FIXED_NOW): string {
  return at.toLocaleTimeString("en-US", { timeStyle: "short", timeZone: zone });
}

/** Minutes since midnight for a zone - used to derive the correct sort order. */
export function minutesOfDayIn(zone: string, at: Date = FIXED_NOW): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);

  const hour = Number(parts.find((p) => p.type === "hour")!.value) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")!.value);

  return hour * 60 + minute;
}
