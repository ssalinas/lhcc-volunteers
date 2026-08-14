import { eq, asc, and } from 'drizzle-orm';
import type { AvailabilityStatus } from '@lhcc/shared';
import { db } from '../../db/client.js';
import { availability } from '../../db/schema/core.schema.js';
import { newId } from '../../lib/ids.js';

export async function listForUser(userId: string) {
  return db.query.availability.findMany({
    where: eq(availability.userId, userId),
    orderBy: [asc(availability.startDate)],
  });
}

/** Sets (creates or updates) the single-day availability entry for exactly `date`. */
export async function setAvailabilityForDate(userId: string, date: string, status: AvailabilityStatus) {
  const existing = await db.query.availability.findFirst({
    where: and(eq(availability.userId, userId), eq(availability.startDate, date), eq(availability.endDate, date)),
  });
  if (existing) {
    const [updated] = await db
      .update(availability)
      .set({ status })
      .where(eq(availability.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(availability)
    .values({ id: newId(), userId, startDate: date, endDate: date, status })
    .returning();
  return created;
}

/** Clears (deletes) the single-day availability entry for `date`, if any — back to "hasn't responded". */
export async function clearAvailabilityForDate(userId: string, date: string) {
  await db
    .delete(availability)
    .where(and(eq(availability.userId, userId), eq(availability.startDate, date), eq(availability.endDate, date)));
}

/** True if `date` (YYYY-MM-DD) falls within any 'available' entry for the user. */
export async function isUserAvailableOn(userId: string, date: string): Promise<boolean> {
  const entries = await listForUser(userId);
  return entries.some((e) => e.status === 'available' && e.startDate <= date && date <= e.endDate);
}
