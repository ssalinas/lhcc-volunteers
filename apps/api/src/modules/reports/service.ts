import { eq, and, gte, lte, ne, sql } from 'drizzle-orm';
import { subWeeks } from 'date-fns';
import { db } from '../../db/client.js';
import { assignments, volunteerRoles, eventOccurrences, teams, teamMemberships } from '../../db/schema/core.schema.js';
import { user } from '../../db/schema/auth.schema.js';

export interface VolunteerHistoryFilter {
  userId?: string;
  from?: Date;
  to?: Date;
}

export async function getVolunteerHistory(filter: VolunteerHistoryFilter) {
  const conditions = [ne(assignments.status, 'declined')];
  if (filter.userId) conditions.push(eq(assignments.userId, filter.userId));
  if (filter.from) conditions.push(gte(eventOccurrences.startAt, filter.from));
  if (filter.to) conditions.push(lte(eventOccurrences.startAt, filter.to));

  const rows = await db
    .select({
      userId: assignments.userId,
      userName: user.name,
      teamId: volunteerRoles.teamId,
      teamName: teams.name,
      startAt: eventOccurrences.startAt,
    })
    .from(assignments)
    .innerJoin(volunteerRoles, eq(volunteerRoles.id, assignments.volunteerRoleId))
    .innerJoin(eventOccurrences, eq(eventOccurrences.id, volunteerRoles.eventOccurrenceId))
    .innerJoin(teams, eq(teams.id, volunteerRoles.teamId))
    .innerJoin(user, eq(user.id, assignments.userId))
    .where(and(...conditions));

  const grouped = new Map<
    string,
    { userId: string; userName: string; teamId: string; teamName: string; totalAssignments: number; lastServedAt: Date | null }
  >();
  for (const row of rows) {
    const key = `${row.userId}:${row.teamId}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.totalAssignments++;
      if (!existing.lastServedAt || row.startAt > existing.lastServedAt) existing.lastServedAt = row.startAt;
    } else {
      grouped.set(key, {
        userId: row.userId,
        userName: row.userName,
        teamId: row.teamId,
        teamName: row.teamName,
        totalAssignments: 1,
        lastServedAt: row.startAt,
      });
    }
  }

  return [...grouped.values()].sort((a, b) => b.totalAssignments - a.totalAssignments);
}

export async function getTeamSummary(windowWeeks: number, teamId?: string) {
  const windowStart = subWeeks(new Date(), windowWeeks);

  const teamRows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      memberCount: sql<number>`count(distinct ${teamMemberships.userId})`.as('memberCount'),
    })
    .from(teams)
    .leftJoin(teamMemberships, eq(teamMemberships.teamId, teams.id))
    .where(teamId ? eq(teams.id, teamId) : undefined)
    .groupBy(teams.id);

  const activityRows = await db
    .select({
      teamId: volunteerRoles.teamId,
      userId: assignments.userId,
      startAt: eventOccurrences.startAt,
    })
    .from(assignments)
    .innerJoin(volunteerRoles, eq(volunteerRoles.id, assignments.volunteerRoleId))
    .innerJoin(eventOccurrences, eq(eventOccurrences.id, volunteerRoles.eventOccurrenceId))
    .where(and(ne(assignments.status, 'declined'), gte(eventOccurrences.startAt, windowStart)));

  const activityByTeam = new Map<string, { count: number; users: Set<string> }>();
  for (const row of activityRows) {
    const bucket = activityByTeam.get(row.teamId) ?? { count: 0, users: new Set<string>() };
    bucket.count++;
    bucket.users.add(row.userId);
    activityByTeam.set(row.teamId, bucket);
  }

  return teamRows.map((t) => {
    const activity = activityByTeam.get(t.teamId);
    return {
      teamId: t.teamId,
      teamName: t.teamName,
      memberCount: t.memberCount,
      assignmentsInWindow: activity?.count ?? 0,
      distinctVolunteersInWindow: activity?.users.size ?? 0,
    };
  });
}

export async function getCoverageGaps(from: Date, to: Date) {
  const occurrences = await db.query.eventOccurrences.findMany({
    where: and(gte(eventOccurrences.startAt, from), lte(eventOccurrences.startAt, to)),
    with: { event: true, roles: { with: { assignments: true } } },
  });

  const gaps: { occurrenceId: string; eventName: string; startAt: string; roleName: string; slotsNeeded: number; slotsFilled: number }[] = [];
  for (const occurrence of occurrences) {
    for (const role of occurrence.roles) {
      const filled = role.assignments.filter((a) => a.status !== 'declined').length;
      if (filled < role.slotsCount) {
        gaps.push({
          occurrenceId: occurrence.id,
          eventName: occurrence.event.name,
          startAt: occurrence.startAt.toISOString(),
          roleName: role.name,
          slotsNeeded: role.slotsCount,
          slotsFilled: filled,
        });
      }
    }
  }
  return gaps.sort((a, b) => a.startAt.localeCompare(b.startAt));
}
