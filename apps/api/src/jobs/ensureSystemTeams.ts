import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { teams } from '../db/schema/core.schema.js';
import { newId } from '../lib/ids.js';

export const ALL_VOLUNTEERS_TEAM_NAME = 'All Volunteers';

/**
 * Idempotently creates the "All Volunteers" system team — a role can target it
 * to pull from every active volunteer instead of a specific team's roster.
 * It has no real team_memberships rows; see modules/scheduling/fairness.ts.
 */
export async function ensureSystemTeams() {
  const existing = await db.query.teams.findFirst({
    where: eq(teams.name, ALL_VOLUNTEERS_TEAM_NAME),
  });
  if (existing) {
    if (!existing.isSystemTeam) {
      await db.update(teams).set({ isSystemTeam: true }).where(eq(teams.id, existing.id));
    }
    return existing;
  }

  const [created] = await db
    .insert(teams)
    .values({
      id: newId(),
      name: ALL_VOLUNTEERS_TEAM_NAME,
      description: 'Automatically includes every active volunteer — use for roles open to anyone.',
      isSystemTeam: true,
    })
    .returning();
  return created;
}
