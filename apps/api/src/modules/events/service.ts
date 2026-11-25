import { eq, and, gt, inArray } from 'drizzle-orm';
import type { CreateEventInput, CreateEventRoleTemplateInput, UpdateEventInput } from '@lhcc/shared';
import { db } from '../../db/client.js';
import { events, eventRoleTemplates, eventOccurrences, volunteerRoles } from '../../db/schema/core.schema.js';
import { newId } from '../../lib/ids.js';
import { NotFoundError } from '../../lib/http-errors.js';
import { generateOccurrencesForEvent, regenerateOccurrencesForEvent } from '../../jobs/generateOccurrences.js';
import { combineDateAndTimeInZone } from '../../lib/dates.js';

export async function listEvents() {
  return db.query.events.findMany({
    where: eq(events.active, true),
    orderBy: (e, { desc }) => [desc(e.createdAt)],
  });
}

export async function getEvent(id: string) {
  const event = await db.query.events.findFirst({
    where: eq(events.id, id),
    with: { roleTemplates: true },
  });
  if (!event) throw new NotFoundError('Event not found');
  return event;
}

export async function createEvent(input: CreateEventInput, createdBy: string) {
  const eventId = newId();
  const now = new Date();

  if (input.isRecurring) {
    const dtstart = new Date(`${input.dtstart.slice(0, 10)}T00:00:00Z`);
    const [created] = await db
      .insert(events)
      .values({
        id: eventId,
        name: input.name,
        description: input.description ?? null,
        location: input.location ?? null,
        defaultStartTime: input.defaultStartTime,
        defaultDurationMinutes: input.defaultDurationMinutes,
        timezone: input.timezone,
        isRecurring: true,
        rrule: input.rrule,
        dtstart,
        recurrenceEndDate: input.recurrenceEndDate ?? null,
        createdBy,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    for (const template of input.roleTemplates) {
      await createRoleTemplate(eventId, template);
    }

    await generateOccurrencesForEvent(created);
    return getEvent(eventId);
  }

  // One-off: write the event definition + its single occurrence + roles immediately.
  const [created] = await db
    .insert(events)
    .values({
      id: eventId,
      name: input.name,
      description: input.description ?? null,
      location: input.location ?? null,
      defaultStartTime: input.defaultStartTime,
      defaultDurationMinutes: input.defaultDurationMinutes,
      timezone: input.timezone,
      isRecurring: false,
      createdBy,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const startAt = combineDateAndTimeInZone(input.occurrenceDate, input.defaultStartTime, input.timezone);
  const endAt = new Date(startAt.getTime() + input.defaultDurationMinutes * 60_000);
  const [occurrence] = await db
    .insert(eventOccurrences)
    .values({ id: newId(), eventId, startAt, endAt })
    .returning();

  // Templates are stored for one-off events too (even though there's only ever one occurrence)
  // so the Edit Event page can list and edit "Roles needed" the same way for both kinds.
  for (const role of input.roleTemplates) {
    const template = await createRoleTemplate(eventId, role);
    await db.insert(volunteerRoles).values({
      id: newId(),
      eventOccurrenceId: occurrence.id,
      teamId: role.teamId,
      name: role.name,
      slotsCount: role.slotsCount,
      stackable: role.stackable,
      sourceTemplateId: template.id,
    });
  }

  return getEvent(created.id);
}

export async function updateEvent(id: string, input: UpdateEventInput) {
  await getEvent(id);
  await db
    .update(events)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(events.id, id));
  return getEvent(id);
}

export async function archiveEvent(id: string) {
  await getEvent(id);
  await db.update(events).set({ active: false, updatedAt: new Date() }).where(eq(events.id, id));
}

export async function createRoleTemplate(eventId: string, input: CreateEventRoleTemplateInput) {
  const [created] = await db
    .insert(eventRoleTemplates)
    .values({
      id: newId(),
      eventId,
      teamId: input.teamId,
      name: input.name,
      slotsCount: input.slotsCount,
      stackable: input.stackable,
      sortOrder: input.sortOrder,
    })
    .returning();
  return created;
}

/**
 * Adds a role template AND applies it to every already-materialized future occurrence of the
 * event. Without the second part, a new role only showed up on dates generated later (past the
 * OCCURRENCE_HORIZON_WEEKS window), so admins added "Greeter" and saw it on none of the
 * upcoming Sundays.
 */
export async function addRoleTemplate(eventId: string, input: CreateEventRoleTemplateInput) {
  await getEvent(eventId);
  const template = await createRoleTemplate(eventId, input);
  const futureOccurrences = await db.query.eventOccurrences.findMany({
    where: and(eq(eventOccurrences.eventId, eventId), gt(eventOccurrences.startAt, new Date())),
  });
  for (const occurrence of futureOccurrences) {
    await db.insert(volunteerRoles).values({
      id: newId(),
      eventOccurrenceId: occurrence.id,
      teamId: template.teamId,
      name: template.name,
      slotsCount: template.slotsCount,
      stackable: template.stackable,
      sourceTemplateId: template.id,
    });
  }
  return { template, occurrencesUpdated: futureOccurrences.length };
}

/**
 * Deletes a role template and removes the roles it created on future occurrences — except any
 * that already have someone assigned, which are left in place (and simply detached from the
 * template by the FK's ON DELETE SET NULL) rather than silently dropping a volunteer.
 */
export async function deleteRoleTemplate(eventId: string, templateId: string) {
  const futureOccurrenceIds = (
    await db.query.eventOccurrences.findMany({
      where: and(eq(eventOccurrences.eventId, eventId), gt(eventOccurrences.startAt, new Date())),
      columns: { id: true },
    })
  ).map((o) => o.id);

  if (futureOccurrenceIds.length > 0) {
    const roles = await db.query.volunteerRoles.findMany({
      where: and(
        eq(volunteerRoles.sourceTemplateId, templateId),
        inArray(volunteerRoles.eventOccurrenceId, futureOccurrenceIds),
      ),
      with: { assignments: { columns: { id: true } } },
    });
    const removable = roles.filter((r) => r.assignments.length === 0).map((r) => r.id);
    if (removable.length > 0) await db.delete(volunteerRoles).where(inArray(volunteerRoles.id, removable));
  }

  await db
    .delete(eventRoleTemplates)
    .where(and(eq(eventRoleTemplates.id, templateId), eq(eventRoleTemplates.eventId, eventId)));
}

export async function regenerateOccurrences(id: string) {
  const event = await getEvent(id);
  return regenerateOccurrencesForEvent(event);
}
