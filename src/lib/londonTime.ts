/**
 * London-time helpers.
 *
 * These live apart from `serviceId.ts` because the timetable needs them too, and
 * `serviceId.ts` already imports the timetable. Pulling them in here keeps
 * `timetable.ts` a leaf module instead of creating an import cycle.
 *
 * Everything the board shows is London time, including "which day is it". Using
 * `Date.prototype.toISOString()` gets this wrong for an hour every night: it is UTC,
 * so between midnight and 01:00 London time (UTC+1 in summer) the UTC date is still
 * yesterday, and the date string disagrees with the local day of the week.
 */
const LONDON_TIME_ZONE = "Europe/London";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: LONDON_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** yyyy-MM-dd in London, used to keep datasets and service ids day-scoped. */
export function londonDateKey(date: Date): string {
  return dayFormatter.format(date);
}

/** Minutes since London midnight for a Date. */
export function londonMinutesForDate(date: Date): number {
  const parts = clockFormatter.formatToParts(date);
  const hours = Number(parts.find((part) => part.type === "hour")?.value);
  const minutes = Number(parts.find((part) => part.type === "minute")?.value);
  return hours * 60 + minutes;
}

/** Minutes since London midnight for an ISO timestamp. */
export function londonMinutes(iso: string): number {
  return londonMinutesForDate(new Date(iso));
}

/**
 * Day of the week in London, 0 = Sunday.
 *
 * Derived from the London date key rather than `Date.prototype.getDay()`, so the
 * weekday and the date string can never disagree. Interpreting a yyyy-MM-dd key as
 * UTC and reading the weekday is exact: the key is already London-local, so there is
 * no timezone left to apply.
 */
export function londonDayOfWeek(date: Date): number {
  const [year, month, day] = londonDateKey(date).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
