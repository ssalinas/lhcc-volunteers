import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { availabilityResponseTokens } from '../db/schema/core.schema.js';
import { newId } from './ids.js';

/** How long an "answer from the email" link keeps working. Long enough to cover a full reminder cycle. */
export const RESPONSE_TOKEN_TTL_DAYS = 30;

function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Mints a login-free link token that lets its holder set ONE user's availability (and nothing
 * else) until it expires. Only the hash is stored. A fresh one is minted per email, so
 * forwarding an email exposes only that one person's availability, and only for a while.
 */
export async function createResponseToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString('base64url');
  await db.insert(availabilityResponseTokens).values({
    id: newId(),
    userId,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + RESPONSE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  });
  return raw;
}

/** Returns the token's (active) user, or null if the token is unknown, expired, or the user is inactive. */
export async function resolveResponseToken(raw: string) {
  const row = await db.query.availabilityResponseTokens.findFirst({
    where: and(eq(availabilityResponseTokens.tokenHash, hashToken(raw)), gt(availabilityResponseTokens.expiresAt, new Date())),
    with: { user: true },
  });
  if (!row || !row.user.active) return null;
  await db
    .update(availabilityResponseTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(availabilityResponseTokens.id, row.id));
  return row.user;
}

export async function pruneExpiredResponseTokens() {
  await db.delete(availabilityResponseTokens).where(lt(availabilityResponseTokens.expiresAt, new Date()));
}
