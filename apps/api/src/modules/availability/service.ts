import { eq, asc } from 'drizzle-orm';
import type { UpsertAvailabilityInput } from '@lhcc/shared';
import { db } from '../../db/client.js';
import { availability } from '../../db/schema/core.schema.js';
import { newId } from '../../lib/ids.js';
import { NotFoundError } from '../../lib/http-errors.js';

export async function listForUser(userId: string) {
  return db.query.availability.findMany({
    where: eq(availability.userId, userId),
    orderBy: [asc(availability.startDate)],
  });
}

export async function createEntry(userId: string, input: UpsertAvailabilityInput) {
  const [created] = await db
    .insert(availability)
    .values({
      id: newId(),
      userId,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
    })
    .returning();
  return created;
}

export async function deleteEntry(userId: string, id: string) {
  const existing = await db.query.availability.findFirst({ where: eq(availability.id, id) });
  if (!existing || existing.userId !== userId) throw new NotFoundError('Availability entry not found');
  await db.delete(availability).where(eq(availability.id, id));
}

/** True if `date` (YYYY-MM-DD) falls within any 'available' range for the user. */
export async function isUserAvailableOn(userId: string, date: string): Promise<boolean> {
  const entries = await listForUser(userId);
  return entries.some((e) => e.status === 'available' && e.startDate <= date && date <= e.endDate);
}
