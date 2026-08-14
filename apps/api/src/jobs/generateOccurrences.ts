import rrulePkg from 'rrule';
const { rrulestr } = rrulePkg;
import { addWeeks } from 'date-fns';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { events, eventOccurrences, eventRoleTemplates, volunteerRoles } from '../db/schema/core.schema.js';
import { newId } from '../lib/ids.js';
import { toUtcDateOnly, combineDateAndTimeInZone } from '../lib/dates.js';
import { env } from '../config/env.js';

type EventRow = typeof events.$inferSelect;

function windowEndFor(eventRow: EventRow): Date {
  const horizonEnd = addWeeks(new Date(), env.OCCURRENCE_HORIZON_WEEKS);
  if (!eventRow.recurrenceEndDate) return horizonEnd;
  const recurrenceEnd = new Date(`${eventRow.recurrenceEndDate}T23:59:59Z`);
  return recurrenceEnd < horizonEnd ? recurrenceEnd : horizonEnd;
}

function expandDates(eventRow: EventRow): Date[] {
  if (!eventRow.rrule || !eventRow.dtstart) return [];
  const rule = rrulestr(eventRow.rrule, { dtstart: eventRow.dtstart });
  return rule.between(eventRow.dtstart, windowEndFor(eventRow), true);
}

/** Materializes any not-yet-created future occurrences (+ their roles) for one recurring event. Idempotent. */
export async function generateOccurrencesForEvent(eventRow: EventRow): Promise<{ created: number }> {
  if (!eventRow.isRecurring || !eventRow.rrule || !eventRow.dtstart) return { created: 0 };

  const roleTemplates = await db.query.eventRoleTemplates.findMany({
    where: eq(eventRoleTemplates.eventId, eventRow.id),
  });

  let created = 0;
  for (const occurrenceDate of expandDates(eventRow)) {
    const dateOnly = toUtcDateOnly(occurrenceDate);
    const startAt = combineDateAndTimeInZone(dateOnly, eventRow.defaultStartTime, eventRow.timezone);
    const endAt = new Date(startAt.getTime() + eventRow.defaultDurationMinutes * 60_000);

    const existing = await db.query.eventOccurrences.findFirst({
      where: and(eq(eventOccurrences.eventId, eventRow.id), eq(eventOccurrences.startAt, startAt)),
    });
    if (existing) continue;

    const [occurrence] = await db
      .insert(eventOccurrences)
      .values({ id: newId(), eventId: eventRow.id, startAt, endAt })
      .returning();

    for (const template of roleTemplates) {
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
    created++;
  }
  return { created };
}

export async function generateAllOccurrences() {
  const recurringEvents = await db.query.events.findMany({
    where: and(eq(events.isRecurring, true), eq(events.active, true)),
  });
  let occurrencesCreated = 0;
  for (const eventRow of recurringEvents) {
    const { created } = await generateOccurrencesForEvent(eventRow);
    occurrencesCreated += created;
  }
  return { eventsProcessed: recurringEvents.length, occurrencesCreated };
}

/**
 * Re-syncs future occurrences to the event's current rrule: adds any newly-valid
 * dates and removes future, unassigned occurrences that the current rule no
 * longer produces. Never touches an occurrence that has any assignment, and
 * never touches occurrences in the past.
 */
export async function regenerateOccurrencesForEvent(eventRow: EventRow): Promise<{ created: number; removed: number }> {
  if (!eventRow.isRecurring || !eventRow.rrule || !eventRow.dtstart) return { created: 0, removed: 0 };

  const validStartTimes = new Set(
    expandDates(eventRow).map((d) =>
      combineDateAndTimeInZone(toUtcDateOnly(d), eventRow.defaultStartTime, eventRow.timezone).getTime(),
    ),
  );

  const futureOccurrences = await db.query.eventOccurrences.findMany({
    where: and(eq(eventOccurrences.eventId, eventRow.id), gt(eventOccurrences.startAt, new Date())),
    with: { roles: { with: { assignments: true } } },
  });

  let removed = 0;
  for (const occurrence of futureOccurrences) {
    const hasAssignments = occurrence.roles.some((r) => r.assignments.length > 0);
    if (!hasAssignments && !validStartTimes.has(occurrence.startAt.getTime())) {
      await db.delete(eventOccurrences).where(eq(eventOccurrences.id, occurrence.id));
      removed++;
    }
  }

  const { created } = await generateOccurrencesForEvent(eventRow);
  return { created, removed };
}
