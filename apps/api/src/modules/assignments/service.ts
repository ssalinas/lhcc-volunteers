import { eq, ne, and } from 'drizzle-orm';
import type { CreateAssignmentInput, UpdateAssignmentInput } from '@lhcc/shared';
import { db } from '../../db/client.js';
import { assignments, volunteerRoles } from '../../db/schema/core.schema.js';
import { newId } from '../../lib/ids.js';
import { ConflictError, NotFoundError } from '../../lib/http-errors.js';

/**
 * A user may hold at most one role per occurrence unless the *new* role is
 * stackable — the spec's "prefer unused volunteers first" preference is a
 * scheduling-time concern (see modules/scheduling/fairness.ts); this is just
 * the hard constraint, with a `force` escape hatch for admin overrides.
 */
async function assertNoConflict(volunteerRoleId: string, userId: string, force: boolean) {
  const role = await db.query.volunteerRoles.findFirst({ where: eq(volunteerRoles.id, volunteerRoleId) });
  if (!role) throw new NotFoundError('Role not found');
  if (role.stackable || force) return;

  const existingInOccurrence = await db
    .select({ id: assignments.id })
    .from(assignments)
    .innerJoin(volunteerRoles, eq(volunteerRoles.id, assignments.volunteerRoleId))
    .where(
      and(
        eq(volunteerRoles.eventOccurrenceId, role.eventOccurrenceId),
        eq(assignments.userId, userId),
        ne(assignments.status, 'declined'),
      ),
    );
  if (existingInOccurrence.length > 0) {
    throw new ConflictError(
      'This volunteer is already assigned to another role for this occurrence. Pass force=true to override.',
    );
  }
}

export async function createAssignment(input: CreateAssignmentInput, assignedByUserId: string | null) {
  await assertNoConflict(input.volunteerRoleId, input.userId, input.force);

  const existing = await db.query.assignments.findFirst({
    where: and(eq(assignments.volunteerRoleId, input.volunteerRoleId), eq(assignments.userId, input.userId)),
  });
  if (existing) {
    if (existing.status === 'declined') {
      const [updated] = await db
        .update(assignments)
        .set({ status: 'scheduled', assignedByUserId, assignedAt: new Date(), respondedAt: null })
        .where(eq(assignments.id, existing.id))
        .returning();
      return updated;
    }
    throw new ConflictError('This volunteer is already assigned to this role.');
  }

  const [created] = await db
    .insert(assignments)
    .values({ id: newId(), volunteerRoleId: input.volunteerRoleId, userId: input.userId, assignedByUserId })
    .returning();
  return created;
}

export async function updateAssignment(id: string, input: UpdateAssignmentInput) {
  const existing = await db.query.assignments.findFirst({ where: eq(assignments.id, id) });
  if (!existing) throw new NotFoundError('Assignment not found');
  const [updated] = await db
    .update(assignments)
    .set({
      ...(input.status !== undefined ? { status: input.status, respondedAt: new Date() } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    })
    .where(eq(assignments.id, id))
    .returning();
  return updated;
}

export async function deleteAssignment(id: string) {
  await db.delete(assignments).where(eq(assignments.id, id));
}

export async function listMine(userId: string) {
  return db.query.assignments.findMany({
    where: and(eq(assignments.userId, userId), ne(assignments.status, 'declined')),
    with: { volunteerRole: { with: { occurrence: { with: { event: true } } } } },
  });
}
