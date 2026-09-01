import { eq, and, gte, lte } from 'drizzle-orm';
import type { CreateVolunteerRoleInput, UpdateOccurrenceInput } from '@lhcc/shared';
import { db } from '../../db/client.js';
import { eventOccurrences, volunteerRoles } from '../../db/schema/core.schema.js';
import { newId } from '../../lib/ids.js';
import { NotFoundError } from '../../lib/http-errors.js';

async function loadOccurrencesWithRoles(from: Date, to: Date) {
  return db.query.eventOccurrences.findMany({
    where: and(gte(eventOccurrences.startAt, from), lte(eventOccurrences.startAt, to)),
    orderBy: (o, { asc }) => [asc(o.startAt)],
    with: {
      event: true,
      roles: { with: { assignments: true, team: true } },
    },
  });
}

export async function listOccurrences(from: Date, to: Date, currentUserId?: string) {
  const rows = await loadOccurrencesWithRoles(from, to);
  return rows.map((o) => {
    const totalSlots = o.roles.reduce((sum, r) => sum + r.slotsCount, 0);
    const filledSlots = o.roles.reduce(
      (sum, r) => sum + r.assignments.filter((a) => a.status !== 'declined').length,
      0,
    );
    const isMineAssigned = currentUserId
      ? o.roles.some((r) => r.assignments.some((a) => a.userId === currentUserId && a.status !== 'declined'))
      : false;
    const teamNames = [...new Set(o.roles.map((r) => r.team.name))];
    return {
      id: o.id,
      eventId: o.eventId,
      eventName: o.event.name,
      startAt: o.startAt.toISOString(),
      endAt: o.endAt.toISOString(),
      status: o.status,
      location: o.locationOverride ?? o.event.location,
      isMineAssigned,
      totalSlots,
      filledSlots,
      teamNames,
    };
  });
}

/** Ids of scheduled (non-canceled) occurrences of one event within [from, to), date ascending. */
export async function listOccurrenceIdsForEvent(eventId: string, from: Date, to: Date): Promise<string[]> {
  const rows = await db.query.eventOccurrences.findMany({
    where: and(
      eq(eventOccurrences.eventId, eventId),
      gte(eventOccurrences.startAt, from),
      lte(eventOccurrences.startAt, to),
    ),
    orderBy: (o, { asc }) => [asc(o.startAt)],
  });
  return rows.filter((o) => o.status !== 'canceled').map((o) => o.id);
}

export async function getOccurrence(id: string) {
  const occurrence = await db.query.eventOccurrences.findFirst({
    where: eq(eventOccurrences.id, id),
    with: {
      event: true,
      roles: { with: { assignments: { with: { user: true } }, team: true } },
    },
  });
  if (!occurrence) throw new NotFoundError('Occurrence not found');
  return occurrence;
}

export async function updateOccurrence(id: string, input: UpdateOccurrenceInput) {
  await getOccurrence(id);
  const patch: Partial<typeof eventOccurrences.$inferInsert> = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.locationOverride !== undefined) patch.locationOverride = input.locationOverride;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.startAt !== undefined) patch.startAt = new Date(input.startAt);
  if (input.endAt !== undefined) patch.endAt = new Date(input.endAt);
  await db.update(eventOccurrences).set(patch).where(eq(eventOccurrences.id, id));
  return getOccurrence(id);
}

export async function addAdHocRole(occurrenceId: string, input: CreateVolunteerRoleInput) {
  await getOccurrence(occurrenceId);
  const [created] = await db
    .insert(volunteerRoles)
    .values({
      id: newId(),
      eventOccurrenceId: occurrenceId,
      teamId: input.teamId,
      name: input.name,
      slotsCount: input.slotsCount,
      stackable: input.stackable,
      sourceTemplateId: null,
    })
    .returning();
  return created;
}
