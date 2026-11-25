/**
 * The church's timezone. Availability is recorded per calendar date, and "which date is this
 * occurrence on?" must have ONE answer everywhere — the server (reminder gaps, fairness's
 * available check, email links) and the browser (Availability page, Calendar) — regardless of
 * the server's or a visitor's own clock. Everyone using the app is in Eastern time.
 */
export const APP_TIMEZONE = 'America/New_York';

const dateKeyFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The YYYY-MM-DD calendar date an instant falls on in APP_TIMEZONE — the key `availability` rows use. */
export function toAppDateKey(instant: Date | string): string {
  const parts = Object.fromEntries(dateKeyFormat.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
