import { eq } from 'drizzle-orm';
import type { CreateUserInput, UpdateUserInput } from '@lhcc/shared';
import { db } from '../../db/client.js';
import { user } from '../../db/schema/auth.schema.js';
import { auth } from '../../auth/auth.js';
import { newId } from '../../lib/ids.js';
import { ConflictError, NotFoundError } from '../../lib/http-errors.js';

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

  if (input.password) {
    const result = await auth.api.signUpEmail({
      body: { email: input.email, password: input.password, name: input.name },
    });
    const [updated] = await db
      .update(user)
      .set({ role: input.role, phone: input.phone ?? null })
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
      emailVerified: false,
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
