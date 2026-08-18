import { eq, inArray, and, ne, lt } from 'drizzle-orm';
import { subWeeks } from 'date-fns';
import { db } from '../../db/client.js';
import { assignments, volunteerRoles, eventOccurrences, teamMemberships, teams } from '../../db/schema/core.schema.js';
import { user } from '../../db/schema/auth.schema.js';
import { toUtcDateOnly } from '../../lib/dates.js';
import { isUserAvailableOn } from '../availability/service.js';
import { env } from '../../config/env.js';

export interface FairnessCandidate {
  userId: string;
  name: string;
  email: string;
  assignmentCountInWindow: number;
  lastServedAt: Date | null;
  alreadyUsedInOccurrence: boolean;
  available: boolean;
  recentlyServedSameEvent: boolean;
}

/** Deterministic tiebreak so equal-fairness candidates don't always sort the same way run after run. */
function stableTiebreakHash(occurrenceId: string, userId: string): number {
  const s = `${occurrenceId}:${userId}`;
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Ranks every active member of `teamId` as a candidate for a role on `occurrenceId`
 * (which starts at `occurrenceDate`), by fairness: fewer recent assignments and
 * longer-since-served come first, with a tiebreak against repeating whoever served on
 * `eventId`'s immediately-preceding occurrence. Used both by the manual "assign" picker
 * and by the auto-scheduler.
 */
export async function getFairnessRankedCandidates(
  teamId: string,
  occurrenceId: string,
  occurrenceDate: Date,
  eventId: string,
): Promise<FairnessCandidate[]> {
  const team = await db.query.teams.findFirst({ where: eq(teams.id, teamId) });

  const members = team?.isSystemTeam
    ? await db.select({ userId: user.id, name: user.name, email: user.email, active: user.active }).from(user)
    : await db
        .select({ userId: teamMemberships.userId, name: user.name, email: user.email, active: user.active })
        .from(teamMemberships)
        .innerJoin(user, eq(user.id, teamMemberships.userId))
        .where(eq(teamMemberships.teamId, teamId));

  const activeMembers = members.filter((m) => m.active);
  if (activeMembers.length === 0) return [];
  const candidateIds = activeMembers.map((m) => m.userId);

  const windowStart = subWeeks(occurrenceDate, env.FAIRNESS_LOOKBACK_WEEKS);

  const history = await db
    .select({
      userId: assignments.userId,
      startAt: eventOccurrences.startAt,
    })
    .from(assignments)
    .innerJoin(volunteerRoles, eq(volunteerRoles.id, assignments.volunteerRoleId))
    .innerJoin(eventOccurrences, eq(eventOccurrences.id, volunteerRoles.eventOccurrenceId))
    .where(and(inArray(assignments.userId, candidateIds), ne(assignments.status, 'declined')));

  const countInWindow = new Map<string, number>();
  const lastServed = new Map<string, Date>();
  for (const h of history) {
    if (h.startAt >= windowStart && h.startAt < occurrenceDate) {
      countInWindow.set(h.userId, (countInWindow.get(h.userId) ?? 0) + 1);
    }
    const current = lastServed.get(h.userId);
    if (!current || h.startAt > current) lastServed.set(h.userId, h.startAt);
  }

  const occurrenceAssignments = await db
    .select({ userId: assignments.userId, status: assignments.status })
    .from(assignments)
    .innerJoin(volunteerRoles, eq(volunteerRoles.id, assignments.volunteerRoleId))
    .where(eq(volunteerRoles.eventOccurrenceId, occurrenceId));
  const usedInOccurrence = new Set(
    occurrenceAssignments.filter((a) => a.status !== 'declined').map((a) => a.userId),
  );

  const previousOccurrence = await db.query.eventOccurrences.findFirst({
    where: and(eq(eventOccurrences.eventId, eventId), lt(eventOccurrences.startAt, occurrenceDate)),
    orderBy: (o, { desc }) => [desc(o.startAt)],
  });

  let recentlyServedIds = new Set<string>();
  if (previousOccurrence) {
    const previousAssignments = await db
      .select({ userId: assignments.userId, status: assignments.status })
      .from(assignments)
      .innerJoin(volunteerRoles, eq(volunteerRoles.id, assignments.volunteerRoleId))
      .where(eq(volunteerRoles.eventOccurrenceId, previousOccurrence.id));
    recentlyServedIds = new Set(
      previousAssignments.filter((a) => a.status !== 'declined').map((a) => a.userId),
    );
  }

  const dateOnly = toUtcDateOnly(occurrenceDate);
  const candidates: FairnessCandidate[] = await Promise.all(
    activeMembers.map(async (m) => ({
      userId: m.userId,
      name: m.name,
      email: m.email,
      assignmentCountInWindow: countInWindow.get(m.userId) ?? 0,
      lastServedAt: lastServed.get(m.userId) ?? null,
      alreadyUsedInOccurrence: usedInOccurrence.has(m.userId),
      available: await isUserAvailableOn(m.userId, dateOnly),
      recentlyServedSameEvent: recentlyServedIds.has(m.userId),
    })),
  );

  return candidates.sort((a, b) => {
    if (a.assignmentCountInWindow !== b.assignmentCountInWindow) {
      return a.assignmentCountInWindow - b.assignmentCountInWindow;
    }
    if (a.recentlyServedSameEvent !== b.recentlyServedSameEvent) {
      return a.recentlyServedSameEvent ? 1 : -1;
    }
    const aTime = a.lastServedAt?.getTime() ?? -Infinity;
    const bTime = b.lastServedAt?.getTime() ?? -Infinity;
    if (aTime !== bTime) return aTime - bTime;
    return stableTiebreakHash(occurrenceId, a.userId) - stableTiebreakHash(occurrenceId, b.userId);
  });
}
