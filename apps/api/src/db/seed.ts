import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { auth } from '../auth/auth.js';
import { db, sqlite } from './client.js';
import { user } from './schema/auth.schema.js';
import { env } from '../config/env.js';

async function main() {
  const email = env.SEED_ADMIN_EMAIL;
  const password = env.SEED_ADMIN_PASSWORD;
  const name = env.SEED_ADMIN_NAME ?? 'Admin';

  if (!email || !password) {
    console.log('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set, skipping admin seed.');
    return;
  }

  const existing = await db.query.user.findFirst({ where: eq(user.email, email) });
  if (existing) {
    if (existing.role !== 'admin') {
      await db.update(user).set({ role: 'admin' }).where(eq(user.id, existing.id));
      console.log(`Promoted existing user ${email} to admin.`);
    } else {
      console.log(`Admin ${email} already exists.`);
    }
    return;
  }

  const result = await auth.api.signUpEmail({ body: { email, password, name } });
  await db.update(user).set({ role: 'admin' }).where(eq(user.id, result.user.id));
  console.log(`Created admin user ${email}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    sqlite.close();
  });
