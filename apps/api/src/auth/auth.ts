import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins/magic-link';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { user } from '../db/schema/auth.schema.js';
import { env } from '../config/env.js';
import { sendMail } from '../lib/mailer.js';
import { appUrl, emailButton, emailColors, emailLayout } from '../lib/emailLayout.js';

const MAGIC_LINK_TTL_MINUTES = 60;

/**
 * Passwordless "email me a sign-in link". better-auth's verify URL consumes the token on first
 * GET, and email security scanners pre-open links — so the email links to our own /signin-link
 * page, which only hits the verify URL when the person taps "Sign me in".
 */
async function sendSignInLinkEmail({ email, token, url }: { email: string; token: string; url: string }) {
  // Only real, approved accounts get an email (disableSignUp below also stops account creation).
  // Silently skipping — instead of erroring — avoids revealing which addresses have accounts.
  const existing = await db.query.user.findFirst({ where: eq(user.email, email.toLowerCase()) });
  if (!existing || !existing.active) return;

  // Carry the page they were trying to reach (the login form's callbackURL) through, if it's an in-app path.
  const callback = new URL(url).searchParams.get('callbackURL');
  const cb = callback && callback.startsWith('/') && !callback.startsWith('//') ? `&cb=${encodeURIComponent(callback)}` : '';
  const link = appUrl(`/signin-link?token=${encodeURIComponent(token)}${cb}`);
  await sendMail({
    to: existing.email,
    subject: 'Your sign-in link for LHCC Volunteers',
    html: emailLayout(
      `<p style="margin:0 0 12px">Hi ${existing.name.split(' ')[0] || existing.name},</p>` +
        `<p style="margin:0 0 16px">Tap the button below to sign in to the LHCC volunteer schedule. No password needed.</p>` +
        `<div style="margin:0 0 16px">${emailButton(link, 'Sign me in', 'primary')}</div>` +
        `<p style="margin:0;font-size:14px;color:${emailColors.muted}">This button works once, for the next ${MAGIC_LINK_TTL_MINUTES} minutes. If you didn't ask to sign in, you can ignore this email.</p>`,
    ),
    text: `Tap this link to sign in to the LHCC volunteer schedule (works once, for ${MAGIC_LINK_TTL_MINUTES} minutes):
${link}

If you didn't ask to sign in, you can ignore this email.`,
  });
}

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
      // Self-service opt-out from the automated availability-reminder emails (both the
      // monthly cron cycle and the admin's ad-hoc "send now") — see
      // jobs/sendAvailabilityReminders.ts. Defaults true so existing users keep getting
      // reminded unless they explicitly turn it off.
      receiveAvailabilityReminders: {
        type: 'boolean',
        defaultValue: true,
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
  plugins: [
    magicLink({
      expiresIn: MAGIC_LINK_TTL_MINUTES * 60,
      disableSignUp: true,
      storeToken: 'hashed',
      sendMagicLink: sendSignInLinkEmail,
    }),
  ],
  session: {
    // Long-lived on purpose: many volunteers struggle to sign in at all, so once they're in on a
    // device they should rarely see the login page again. Refreshed daily while in use.
    expiresIn: 60 * 60 * 24 * 180, // 180 days
    updateAge: 60 * 60 * 24, // refresh once a day of use
  },
});

export type Auth = typeof auth;
