import { eq, and, gte, sql } from 'drizzle-orm';
import type { CreateTeamInput, UpdateTeamInput } from '@lhcc/shared';
import { db } from '../../db/client.js';
import {
  teams,
  teamMemberships,
  eventRoleTemplates,
  volunteerRoles,
  eventOccurrences,
  events,
} from '../../db/schema/core.schema.js';
import { user } from '../../db/schema/auth.schema.js';
import { newId } from '../../lib/ids.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/http-errors.js';

export async function listTeams(currentUserId?: string) {
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      description: teams.description,
      active: teams.active,
      isSystemTeam: teams.isSystemTeam,
      createdAt: teams.createdAt,
      memberCount: sql<number>`count(distinct ${teamMemberships.userId})`.as('memberCount'),
    })
    .from(teams)
    .leftJoin(teamMemberships, eq(teamMemberships.teamId, teams.id))
    // Inactive = removed by an admin but kept for history (see removeTeam) — hidden everywhere.
    .where(eq(teams.active, true))
    .groupBy(teams.id)
    .orderBy(teams.name);

  if (rows.some((r) => r.isSystemTeam)) {
    const [{ count: activeUserCount }] = await db
      .select({ count: sql<number>`count(*)`.as('count') })
      .from(user)
      .where(eq(user.active, true));
    for (const r of rows) {
      if (r.isSystemTeam) r.memberCount = activeUserCount;
    }
  }

  if (!currentUserId) return rows.map((r) => ({ ...r, isMember: undefined }));

  const myMemberships = await db
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, currentUserId));
  const myTeamIds = new Set(myMemberships.map((m) => m.teamId));

  return rows.map((r) => ({ ...r, isMember: r.isSystemTeam ? true : myTeamIds.has(r.id) }));
}

export async function getTeam(id: string) {
  const team = await db.query.teams.findFirst({ where: eq(teams.id, id) });
  if (!team) throw new NotFoundError('Team not found');
  return team;
}

export async function createTeam(input: CreateTeamInput) {
  const existing = await db.query.teams.findFirst({ where: eq(teams.name, input.name) });
  if (existing && !existing.active) {
    // A previously removed (archived) team holds this name — bring it back, history and all,
    // rather than failing on the unique name constraint.
    const [restored] = await db
      .update(teams)
      .set({ active: true, description: input.description ?? existing.description })
      .where(eq(teams.id, existing.id))
      .returning();
    return restored;
  }
  if (existing) throw new ConflictError('A team with this name already exists');
  const [created] = await db
    .insert(teams)
    .values({ id: newId(), name: input.name, description: input.description ?? null })
    .returning();
  return created;
}

export async function updateTeam(id: string, input: UpdateTeamInput) {
  await getTeam(id);
  const [updated] = await db.update(teams).set(input).where(eq(teams.id, id)).returning();
  return updated;
}

export async function listMembers(teamId: string) {
  const team = await getTeam(teamId);

  if (team.isSystemTeam) {
    const activeUsers = await db.query.user.findMany({
      where: eq(user.active, true),
      orderBy: (u, { asc }) => [asc(u.name)],
    });
    return activeUsers.map((u) => ({
      teamId,
      userId: u.id,
      joinedAt: team.createdAt,
      userName: u.name,
      userEmail: u.email,
      userRole: u.role,
      userActive: u.active,
      userPhone: u.phone,
    }));
  }

  return db
    .select({
      teamId: teamMemberships.teamId,
      userId: teamMemberships.userId,
      joinedAt: teamMemberships.joinedAt,
      userName: user.name,
      userEmail: user.email,
      userRole: user.role,
      userActive: user.active,
      userPhone: user.phone,
    })
    .from(teamMemberships)
    .innerJoin(user, eq(user.id, teamMemberships.userId))
    .where(eq(teamMemberships.teamId, teamId))
    .orderBy(user.name);
}

export async function addMember(teamId: string, userId: string) {
  const team = await getTeam(teamId);
  if (team.isSystemTeam) {
    throw new BadRequestError('This team automatically includes every active volunteer — membership can\'t be edited.');
  }
  const existing = await db.query.teamMemberships.findFirst({
    where: and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.userId, userId)),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(teamMemberships)
    .values({ id: newId(), teamId, userId })
    .returning();
  return created;
}

export async function removeMember(teamId: string, userId: string) {
  const team = await getTeam(teamId);
  if (team.isSystemTeam) {
    throw new BadRequestError('This team automatically includes every active volunteer — membership can\'t be edited.');
  }
  await db
    .delete(teamMemberships)
    .where(and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.userId, userId)));
}

/**
 * Removes a team from the app. Refuses while anything upcoming still depends on it (an event's
 * role list, or a role on a future date) — the admin must reassign those roles first, otherwise
 * future dates would silently lose their volunteers. If only *past* dates reference the team, it's
 * archived (`active = false`, hidden from every list) instead of deleted, so old schedules and
 * reports keep its name; a team nothing references is deleted outright.
 */
export async function removeTeam(id: string): Promise<{ archived: boolean }> {
  const team = await getTeam(id);
  if (team.isSystemTeam) {
    throw new BadRequestError("The All Volunteers team is built in and can't be removed.");
  }

  const templateEvents = await db
    .selectDistinct({ name: events.name })
    .from(eventRoleTemplates)
    .innerJoin(events, eq(events.id, eventRoleTemplates.eventId))
    .where(eq(eventRoleTemplates.teamId, id));
  const upcomingEvents = await db
    .selectDistinct({ name: events.name })
    .from(volunteerRoles)
    .innerJoin(eventOccurrences, eq(eventOccurrences.id, volunteerRoles.eventOccurrenceId))
    .innerJoin(events, eq(events.id, eventOccurrences.eventId))
    .where(and(eq(volunteerRoles.teamId, id), gte(eventOccurrences.startAt, new Date())));

  const blocking = [...new Set([...templateEvents, ...upcomingEvents].map((e) => e.name))].sort();
  if (blocking.length > 0) {
    throw new ConflictError(
      `"${team.name}" is still used by roles on: ${blocking.join(', ')}. ` +
        'Change those roles to a different team (or remove them) first, then try again.',
    );
  }

  const [{ count: pastRoleCount }] = await db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(volunteerRoles)
    .where(eq(volunteerRoles.teamId, id));

  if (pastRoleCount > 0) {
    await db.transaction((tx) => {
      tx.delete(teamMemberships).where(eq(teamMemberships.teamId, id)).run();
      tx.update(teams).set({ active: false }).where(eq(teams.id, id)).run();
    });
    return { archived: true };
  }

  await db.delete(teams).where(eq(teams.id, id)); // memberships cascade
  return { archived: false };
}
