import { and, eq, gte, lt } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { eventOccurrences, teams, teamMemberships, availability } from '../../db/schema/core.schema.js';
import { user } from '../../db/schema/auth.schema.js';
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

export interface RelevantAvailabilityDate {
  /** UTC calendar date (YYYY-MM-DD) — the same key reminders and fairness use. */
  date: string;
  eventNames: string[];
  status: 'available' | 'unavailable' | null;
}

/**
 * Active, non-canceled occurrences in [from, to) that involve any team `userId` belongs to
 * (including system teams, where every active user is implicitly a member), paired with that
 * user's availability row for the occurrence's date, if any.
 */
async function loadRelevantOccurrences(userId: string, from: Date, to: Date) {
  const [myMemberships, systemTeams, occurrences, myAvailability] = await Promise.all([
    db.select({ teamId: teamMemberships.teamId }).from(teamMemberships).where(eq(teamMemberships.userId, userId)),
    db.select({ id: teams.id }).from(teams).where(eq(teams.isSystemTeam, true)),
    loadOccurrencesInRange(from, to),
    db.query.availability.findMany({ where: eq(availability.userId, userId) }),
  ]);

  const teamIds = new Set([...myMemberships.map((m) => m.teamId), ...systemTeams.map((t) => t.id)]);
  if (teamIds.size === 0) return [];

  return occurrences
    .filter((o) => o.status !== 'canceled' && o.event.active && o.roles.some((r) => teamIds.has(r.teamId)))
    .map((occurrence) => {
      const date = toUtcDateOnly(occurrence.startAt);
      const covering = myAvailability.filter((a) => a.startDate <= date && date <= a.endDate);
      const status = covering.find((a) => a.status === 'unavailable')?.status ?? covering[0]?.status ?? null;
      return { occurrence, date, status };
    });
}

/**
 * Occurrences in [from, to) relevant to `userId` (see loadRelevantOccurrences) that have no
 * availability row at all covering that date — distinct from an explicit 'unavailable' row,
 * which counts as "already responded" and is not a gap.
 */
export async function getUnsetAvailabilityDates(userId: string, from: Date, to: Date): Promise<AvailabilityGap[]> {
  const relevant = await loadRelevantOccurrences(userId, from, to);
  return relevant
    .filter((r) => r.status === null)
    .map(({ occurrence }) => ({ occurrenceId: occurrence.id, eventName: occurrence.event.name, startAt: occurrence.startAt }));
}

/** Every date in [from, to) relevant to `userId`, grouped by date, with their current answer. Powers the email-link page. */
export async function getRelevantAvailabilityDates(userId: string, from: Date, to: Date): Promise<RelevantAvailabilityDate[]> {
  const relevant = await loadRelevantOccurrences(userId, from, to);
  const byDate = new Map<string, RelevantAvailabilityDate>();
  for (const { occurrence, date, status } of relevant) {
    const entry = byDate.get(date) ?? { date, eventNames: [], status };
    if (!entry.eventNames.includes(occurrence.event.name)) entry.eventNames.push(occurrence.event.name);
    byDate.set(date, entry);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Admin "who hasn't responded" grid: every active user × every date in [from, to) that has an
 * active occurrence. A user's `statuses` only has keys for dates relevant to their teams, so
 * the UI can grey out dates that don't concern them.
 */
export async function getAvailabilityGrid(from: Date, to: Date) {
  const [activeUsers, memberships, systemTeams, occurrences, rows] = await Promise.all([
    db.query.user.findMany({ where: eq(user.active, true), orderBy: (u, { asc }) => [asc(u.name)] }),
    db.select({ teamId: teamMemberships.teamId, userId: teamMemberships.userId }).from(teamMemberships),
    db.select({ id: teams.id }).from(teams).where(eq(teams.isSystemTeam, true)),
    loadOccurrencesInRange(from, to),
    db.query.availability.findMany(),
  ]);

  const live = occurrences.filter((o) => o.status !== 'canceled' && o.event.active);
  const dateEntries = new Map<string, { date: string; eventNames: string[]; teamIds: Set<string> }>();
  for (const o of live) {
    const date = toUtcDateOnly(o.startAt);
    const entry = dateEntries.get(date) ?? { date, eventNames: [], teamIds: new Set<string>() };
    if (!entry.eventNames.includes(o.event.name)) entry.eventNames.push(o.event.name);
    for (const r of o.roles) entry.teamIds.add(r.teamId);
    dateEntries.set(date, entry);
  }
  const dates = [...dateEntries.values()].sort((a, b) => a.date.localeCompare(b.date));
  const systemTeamIds = systemTeams.map((t) => t.id);

  return {
    dates: dates.map(({ date, eventNames }) => ({ date, eventNames })),
    users: activeUsers.map((u) => {
      const myTeams = new Set([...memberships.filter((m) => m.userId === u.id).map((m) => m.teamId), ...systemTeamIds]);
      const mine = rows.filter((a) => a.userId === u.id);
      const statuses: Record<string, 'available' | 'unavailable' | null> = {};
      for (const d of dates) {
        if (![...d.teamIds].some((t) => myTeams.has(t))) continue;
        const covering = mine.filter((a) => a.startDate <= d.date && d.date <= a.endDate);
        statuses[d.date] = covering.find((a) => a.status === 'unavailable')?.status ?? covering[0]?.status ?? null;
      }
      return { userId: u.id, name: u.name, statuses };
    }),
  };
}
