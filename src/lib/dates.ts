// Calendar-day comparison in the Romanian timezone. Due dates are stored at
// (UTC) midnight, so comparing the raw timestamp to `now` made a date that is
// due TODAY look overdue (off-by-one). Compare by RO calendar day instead.

const roDayMs = (d: Date): number =>
  new Date(d.toLocaleDateString('en-CA', { timeZone: 'Europe/Bucharest' }) + 'T00:00:00Z').getTime();

/** Whole calendar days from today to the due date (negative = past). null if no date. */
export function daysUntilDue(dueAt: Date | string | null | undefined): number | null {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  if (isNaN(d.getTime())) return null;
  return Math.round((roDayMs(d) - roDayMs(new Date())) / 86400000);
}

/** True only when the due date is strictly before today (due today is NOT overdue). */
export function isOverdue(dueAt: Date | string | null | undefined): boolean {
  const d = daysUntilDue(dueAt);
  return d != null && d < 0;
}

/** Start of today (RO calendar) as a Date — for SQL "due before today" filters. */
export function startOfTodayRO(): Date {
  return new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Bucharest' }) + 'T00:00:00Z');
}
