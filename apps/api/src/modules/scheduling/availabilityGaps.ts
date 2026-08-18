import { and, eq, gte, lt } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { eventOccurrences, teams, teamMemberships, availability } from '../../db/schema/core.schema.js';
import { toUtcDateOnly } from '../../lib/dates.js';

export interface AvailabilityGap {
  occurrenceId: string;
  eventName: string;
  startAt: Date;
}

async function loadOccurrencesInRange(from: Date, to: Date) {
  return db.query.eventOccurrences.findMany({
    where: and(gte(eventOccurrences.startAt, from), lt(eventOccurrences.startAt, to)),
    orderBy: (o, { asc }) => [asc(o.startAt)],
    with: { event: true, roles: true },
  });
}

/**
 * Occurrences in [from, to) on any team `userId` belongs to (including system teams, where
 * every active user is implicitly a member) that have no availability row at all covering that
 * date — distinct from an explicit 'unavailable' row, which counts as "already responded" and
 * is not a gap.
 */
export async function getUnsetAvailabilityDates(userId: string, from: Date, to: Date): Promise<AvailabilityGap[]> {
  const [myMemberships, systemTeams, occurrences, myAvailability] = await Promise.all([
    db.select({ teamId: teamMemberships.teamId }).from(teamMemberships).where(eq(teamMemberships.userId, userId)),
    db.select({ id: teams.id }).from(teams).where(eq(teams.isSystemTeam, true)),
    loadOccurrencesInRange(from, to),
    db.query.availability.findMany({ where: eq(availability.userId, userId) }),
  ]);

  const teamIds = new Set([...myMemberships.map((m) => m.teamId), ...systemTeams.map((t) => t.id)]);
  if (teamIds.size === 0) return [];

  const gaps: AvailabilityGap[] = [];
  for (const occurrence of occurrences) {
    if (occurrence.status === 'canceled') continue;
    if (!occurrence.roles.some((r) => teamIds.has(r.teamId))) continue;

    const dateOnly = toUtcDateOnly(occurrence.startAt);
    const hasResponse = myAvailability.some((a) => a.startDate <= dateOnly && dateOnly <= a.endDate);
    if (!hasResponse) {
      gaps.push({ occurrenceId: occurrence.id, eventName: occurrence.event.name, startAt: occurrence.startAt });
    }
  }
  return gaps;
}
