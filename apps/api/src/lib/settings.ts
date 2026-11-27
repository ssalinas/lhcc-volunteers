import { and, eq, isNull, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { appSettings, availabilityReminderCycles } from '../db/schema/core.schema.js';
import { user } from '../db/schema/auth.schema.js';
import { toAppDateKey } from './dates.js';

/**
 * Admin-toggleable app-wide switches, stored in `app_settings`. Every key has a default that
 * applies until an admin first changes it, so an empty table behaves exactly like before the
 * table existed.
 */
const AVAILABILITY_REMINDERS_AUTOMATIC = 'availabilityReminders.automaticEnabled';

export async function getAvailabilityRemindersAutomatic() {
  const row = await db
    .select({ value: appSettings.value, updatedAt: appSettings.updatedAt, updatedByName: user.name })
    .from(appSettings)
    .leftJoin(user, eq(user.id, appSettings.updatedByUserId))
    .where(eq(appSettings.key, AVAILABILITY_REMINDERS_AUTOMATIC))
    .get();
  return {
    enabled: row ? JSON.parse(row.value) === true : true,
    changedAt: row?.updatedAt ?? null,
    changedBy: row?.updatedByName ?? null,
  };
}

export async function isAvailabilityRemindersAutomaticEnabled() {
  return (await getAvailabilityRemindersAutomatic()).enabled;
}

/**
 * Turns the daily automatic reminder job on or off. Turning it back on also closes out reminder
 * cycles left open from earlier months while it was paused: otherwise those stale cycles would
 * all send a followup on the next run, on top of the new month's kickoff email.
 */
export async function setAvailabilityRemindersAutomatic(enabled: boolean, userId: string) {
  const now = new Date();
  db.transaction((tx) => {
    tx.insert(appSettings)
      .values({ key: AVAILABILITY_REMINDERS_AUTOMATIC, value: JSON.stringify(enabled), updatedAt: now, updatedByUserId: userId })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: JSON.stringify(enabled), updatedAt: now, updatedByUserId: userId },
      })
      .run();
    if (enabled) {
      const currentMonth = toAppDateKey(now).slice(0, 7);
      tx.update(availabilityReminderCycles)
        .set({ exhaustedAt: now })
        .where(
          and(
            isNull(availabilityReminderCycles.resolvedAt),
            isNull(availabilityReminderCycles.exhaustedAt),
            lt(availabilityReminderCycles.cycleMonth, currentMonth),
          ),
        )
        .run();
    }
  });
  return getAvailabilityRemindersAutomatic();
}
