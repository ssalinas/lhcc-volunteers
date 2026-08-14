import { eq, and, sql } from 'drizzle-orm';
import type { CreateTeamInput, UpdateTeamInput } from '@lhcc/shared';
import { db } from '../../db/client.js';
import { teams, teamMemberships } from '../../db/schema/core.schema.js';
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
