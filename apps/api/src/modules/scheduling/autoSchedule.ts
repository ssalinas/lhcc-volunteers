import { getOccurrence } from '../occurrences/service.js';
import { createAssignment } from '../assignments/service.js';
import { getFairnessRankedCandidates, type FairnessCandidate } from './fairness.js';

export interface AutoScheduleGapResult {
  volunteerRoleId: string;
  roleName: string;
  slotsNeeded: number;
  slotsFilled: number;
  reason: 'no_eligible_members' | 'no_one_available' | 'all_candidates_exhausted';
}

function gapReason(candidates: FairnessCandidate[]): AutoScheduleGapResult['reason'] {
  if (candidates.length === 0) return 'no_eligible_members';
  if (!candidates.some((c) => c.available)) return 'no_one_available';
  return 'all_candidates_exhausted';
}

/**
 * Fills unfilled slots on every role of an occurrence, fairness-ranked and most-
 * constrained-role-first. Idempotent (only ever adds to unfilled slots) and safe
 * to re-run after manual edits. See modules/scheduling/fairness.ts for the ranking.
 * `roleNameFilter`, when non-empty, restricts this to only roles whose name is in the
 * set (e.g. schedule just "Singers" now, leave the rest for later) — everything else
 * about the occurrence is left untouched.
 */
export async function autoScheduleOccurrence(occurrenceId: string, adminUserId: string, roleNameFilter?: string[]) {
  const occurrence = await getOccurrence(occurrenceId);
  const roles =
    roleNameFilter && roleNameFilter.length > 0
      ? occurrence.roles.filter((r) => roleNameFilter.includes(r.name))
      : occurrence.roles;

  const roleStates = await Promise.all(
    roles.map(async (role) => {
      const filled = role.assignments.filter((a) => a.status !== 'declined').length;
      const remaining = role.slotsCount - filled;
      const candidates =
        remaining > 0
          ? await getFairnessRankedCandidates(role.teamId, occurrenceId, occurrence.startAt, occurrence.eventId)
          : [];
      const availableFreshCount = candidates.filter((c) => c.available && !c.alreadyUsedInOccurrence).length;
      return { role, remaining, availableFreshCount };
    }),
  );

  // Most-constrained-first: fewest available fresh candidates goes first, so an
  // easy role doesn't consume the only candidate a harder role needed.
  const orderedRoles = roleStates
    .filter((r) => r.remaining > 0)
    .sort((a, b) => a.availableFreshCount - b.availableFreshCount);

  const createdAssignments: Awaited<ReturnType<typeof createAssignment>>[] = [];
  const gaps: AutoScheduleGapResult[] = [];

  for (const { role, remaining } of orderedRoles) {
    // Re-fetch fresh each iteration: earlier roles in this same run may have just
    // used someone, which must be reflected in "alreadyUsedInOccurrence" now.
    const candidates = await getFairnessRankedCandidates(role.teamId, occurrenceId, occurrence.startAt, occurrence.eventId);
    const fresh = candidates.filter((c) => c.available && !c.alreadyUsedInOccurrence);
    const stacked = role.stackable ? candidates.filter((c) => c.available && c.alreadyUsedInOccurrence) : [];
    const pool = [...fresh, ...stacked];

    let filledThisRole = 0;
    for (const candidate of pool) {
      if (filledThisRole >= remaining) break;
      const created = await createAssignment(
        { volunteerRoleId: role.id, userId: candidate.userId, force: false },
        adminUserId,
      );
      createdAssignments.push(created);
      filledThisRole++;
    }

    if (filledThisRole < remaining) {
      gaps.push({
        volunteerRoleId: role.id,
        roleName: role.name,
        slotsNeeded: remaining,
        slotsFilled: filledThisRole,
        reason: gapReason(candidates),
      });
    }
  }

  return { occurrenceId, createdAssignments, gaps };
}
