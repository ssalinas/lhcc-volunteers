import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db, schema } from '../db/client.js';
import { env } from '../config/env.js';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema,
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: env.TRUSTED_ORIGINS,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  socialProviders:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : undefined,
  // Google sign-in against an email an admin already created (password-only)
  // should link to that existing account rather than erroring as a duplicate.
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
    },
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'volunteer',
        input: false,
      },
      phone: {
        type: 'string',
        required: false,
      },
      // Active by default — email/password accounts only ever get created by an admin
      // (via modules/users/service.ts; there's no public sign-up form), so that path is
      // inherently already "approved". The one truly open door is Google sign-in, which
      // auto-creates a new account for any Google user on first login — that's gated to
      // inactive below, via the create.before hook, so a random Google sign-in can't get
      // real access without an admin flipping them active on the Users page.
      active: {
        type: 'boolean',
        defaultValue: true,
        input: false,
      },
    },
  },
  // Requires an admin to approve any brand-new account created via Google sign-in
  // before it can do anything (see auth/plugin.ts's requireAuth, which rejects
  // active: false). `context.path` here is the *endpoint template* better-auth matched
  // ("/callback/:id" for every OAuth provider callback, vs. e.g. "/sign-up/email"), not
  // the resolved request URL — this only fires for account creation via OAuth.
  databaseHooks: {
    user: {
      create: {
        before: async (newUser, context) => {
          if (context?.path?.startsWith('/callback/')) {
            return { data: { ...newUser, active: false } };
          }
          return { data: newUser };
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh once a day of use
  },
});

export type Auth = typeof auth;
