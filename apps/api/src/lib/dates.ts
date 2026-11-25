import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { APP_TIMEZONE } from '@lhcc/shared';

export { toAppDateKey } from '@lhcc/shared';

/**
 * Extracts the UTC calendar-date components of `date` as "YYYY-MM-DD". Only for rrule
 * expansion (generateOccurrences), whose dates are UTC midnights — NOT for availability date
 * keys, which must use toAppDateKey (Eastern) so evening events land on the right day.
 */
export function toUtcDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Combines a calendar date (YYYY-MM-DD) with a wall-clock time ("HH:mm") as it
 * would read on a clock in `timezone`, returning the correct UTC instant —
 * accounting for that specific date's DST offset in that timezone.
 */
export function combineDateAndTimeInZone(dateOnly: string, time: string, timezone: string): Date {
  return fromZonedTime(`${dateOnly}T${time}:00`, timezone);
}

/**
 * Formats an instant as wall-clock time in the church's timezone (APP_TIMEZONE). Use this for
 * anything server-rendered (emails) — date-fns's plain `format` uses the server's own clock,
 * which on a UTC-configured Pi would print a 10am service as "3:00 PM".
 */
export function formatInAppTimezone(instant: Date, pattern: string): string {
  return formatInTimeZone(instant, APP_TIMEZONE, pattern);
}
