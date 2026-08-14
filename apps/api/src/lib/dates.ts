import { fromZonedTime } from 'date-fns-tz';

/** Extracts the UTC calendar-date components of `date` as "YYYY-MM-DD". */
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
