import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { user } from '../../db/schema/auth.schema.js';
import { sendMail } from '../../lib/mailer.js';
import { createResponseToken } from '../../lib/responseTokens.js';
import { appUrl, emailButton, emailColors, emailLayout, escapeHtml } from '../../lib/emailLayout.js';
import { BadRequestError } from '../../lib/http-errors.js';
import { getUser } from './service.js';

/**
 * "Welcome to the volunteer app" — sent only when an admin clicks the button on the Users page.
 * Many volunteers didn't know the app existed, and many can't manage a password, so this leads
 * with a login-free availability link (same token as reminder emails) and explains the
 * no-password "email me a sign-in link" option for everything else.
 */
export async function sendWelcomeEmail(userId: string): Promise<Date> {
  const u = await getUser(userId);
  if (!u.active) throw new BadRequestError('This person is not active yet — check "Active" first.');

  const firstName = u.name.split(' ')[0] || u.name;
  const token = await createResponseToken(u.id);
  const availabilityLink = appUrl(`/respond?t=${token}`);
  const loginLink = appUrl(`/login?email=${encodeURIComponent(u.email)}`);

  const html = emailLayout(
    `<p style="margin:0 0 12px">Hi ${escapeHtml(firstName)},</p>` +
      `<p style="margin:0 0 12px">Longwood Hills uses a simple website to plan who serves each week — greeters, ushers, music and more. You've been added as a volunteer.</p>` +
      `<p style="margin:0 0 8px"><strong>The one thing we need from you:</strong> let us know which dates you can serve. Tap the button below — no password needed.</p>` +
      `<div style="margin:12px 0 20px">${emailButton(availabilityLink, 'Tell us when you can serve', 'success')}</div>` +
      `<p style="margin:0 0 8px"><strong>To see your schedule any time:</strong></p>` +
      `<ol style="margin:0 0 12px;padding-left:22px"><li>Go to <a href="${escapeHtml(appUrl('/login'))}" style="color:${emailColors.primary}">${escapeHtml(appUrl('/login'))}</a></li><li>Type your email address: <strong>${escapeHtml(u.email)}</strong></li><li>Tap <strong>“Email me a sign-in link”</strong>, then open the email we send you and tap the button in it.</li></ol>` +
      `<p style="margin:0 0 12px">No password to remember. Once you're signed in, you'll stay signed in on that device.</p>` +
      `<div style="margin:8px 0 16px">${emailButton(loginLink, 'Sign in now', 'primary')}</div>` +
      `<p style="margin:0;font-size:15px;color:${emailColors.muted}">We'll also email you a reminder each month with buttons to answer for upcoming dates. Questions? Just reply to this email and a person from the church will help.</p>`,
  );

  const text = [
    `Hi ${firstName},`,
    '',
    "Longwood Hills uses a simple website to plan who serves each week. You've been added as a volunteer.",
    '',
    'Please tell us which dates you can serve (no password needed):',
    availabilityLink,
    '',
    'To see your schedule any time:',
    `1. Go to ${appUrl('/login')}`,
    `2. Type your email address: ${u.email}`,
    '3. Tap "Email me a sign-in link", then open the email we send you and tap the button in it.',
    '',
    'Questions? Just reply to this email and a person from the church will help.',
  ].join('\n');

  await sendMail({ to: u.email, subject: 'Welcome to the LHCC volunteer schedule', html, text });

  const sentAt = new Date();
  await db.update(user).set({ welcomeEmailSentAt: sentAt }).where(eq(user.id, u.id));
  return sentAt;
}
