import { eq } from 'drizzle-orm';
import type { CreateUserInput, UpdateUserInput } from '@lhcc/shared';
import { db } from '../../db/client.js';
import { user } from '../../db/schema/auth.schema.js';
import { auth } from '../../auth/auth.js';
import { newId } from '../../lib/ids.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/http-errors.js';

export async function listUsers() {
  return db.query.user.findMany({ orderBy: (u, { asc }) => [asc(u.name)] });
}

export async function getUser(id: string) {
  const found = await db.query.user.findFirst({ where: eq(user.id, id) });
  if (!found) throw new NotFoundError('User not found');
  return found;
}

export async function createUser(input: CreateUserInput) {
  const existing = await db.query.user.findFirst({ where: eq(user.email, input.email) });
  if (existing) throw new ConflictError('A user with this email already exists');

  // emailVerified: true on both branches below — an admin typing in this email IS the
  // verification. This also matters for a later Google sign-in against the same email:
  // better-auth's account linking (see auth.ts) additionally requires the *existing*
  // local user to already be emailVerified before it'll link a new provider to it
  // (`requireLocalEmailVerified`, defaults to true) — leaving this false here would
  // permanently deadlock that flow, since the row can only become verified *by*
  // linking, which is blocked *because* it isn't verified yet.
  if (input.password) {
    const result = await auth.api.signUpEmail({
      body: { email: input.email, password: input.password, name: input.name },
    });
    const [updated] = await db
      .update(user)
      .set({ role: input.role, phone: input.phone ?? null, emailVerified: true })
      .where(eq(user.id, result.user.id))
      .returning();
    return updated;
  }

  // No password set — admin is inviting a volunteer who will sign in with Google
  // against this email later; better-auth's trusted-provider account linking
  // (see auth.ts) attaches their Google account to this row on first sign-in.
  const now = new Date();
  const [created] = await db
    .insert(user)
    .values({
      id: newId(),
      name: input.name,
      email: input.email,
      emailVerified: true,
      role: input.role,
      phone: input.phone ?? null,
      active: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return created;
}

export async function updateUser(id: string, input: UpdateUserInput) {
  await getUser(id);
  const [updated] = await db
    .update(user)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(user.id, id))
    .returning();
  return updated;
}

export async function deleteUser(id: string, requestingUserId: string) {
  if (id === requestingUserId) {
    throw new BadRequestError("You can't delete your own account.");
  }
  await getUser(id);

  try {
    await db.delete(user).where(eq(user.id, id));
  } catch (err) {
    // Most FKs to user.id cascade (assignments, availability, team_memberships, sessions), but
    // a few "who did this" audit columns deliberately don't (events.createdBy,
    // assignments.assignedByUserId, schedule_notification_batches.sentByUserId) — SQLite raises
    // a foreign key constraint error rather than silently orphaning that history.
    if (err instanceof Error && 'code' in err && err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      throw new ConflictError(
        "Can't delete this user — they have history elsewhere in the app (created an event, " +
          'assigned a volunteer, or sent a notification). Set them to inactive instead to remove ' +
          "their access without losing that history.",
      );
    }
    throw err;
  }
}
