import { addMonths, differenceInCalendarDays, format } from 'date-fns';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { user } from '../db/schema/auth.schema.js';
import { availabilityReminderCycles, availabilityReminderSends } from '../db/schema/core.schema.js';
import { getUnsetAvailabilityDates, type AvailabilityGap } from '../modules/scheduling/availabilityGaps.js';
import { sendMail } from '../lib/mailer.js';
import { newId } from '../lib/ids.js';
import { createResponseToken, pruneExpiredResponseTokens, RESPONSE_TOKEN_TTL_DAYS } from '../lib/responseTokens.js';
import { appUrl, emailButton, emailColors, emailLayout, escapeHtml } from '../lib/emailLayout.js';
import { toAppDateKey } from '../lib/dates.js';
import { isAvailabilityRemindersAutomaticEnabled } from '../lib/settings.js';

const WINDOW_MONTHS = 2;
const MANUAL_WINDOW_MONTHS = 1;
const FOLLOWUP_INTERVAL_DAYS = 2;
const MAX_REMINDERS = 4;
// Self-healing proxy for "end of month": the real guard against double-kickoff is "no cycle
// row exists yet this cycleMonth" (enforced by a unique index), so a missed run on the exact
// last day still catches on a later day within the same month.
const KICKOFF_DAY_OF_MONTH = 25;

interface ReminderLogger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  error?: (obj: unknown, msg: string) => void;
}

export interface ReminderCycleResult {
  kickoffsSent: number;
  followupsSent: number;
  resolved: number;
  exhausted: number;
  /** True when an admin has turned automatic reminders off (Reminders page), so nothing was sent. */
  skipped: boolean;
}

/**
 * Each date gets its own "I can serve" / "Can't make it" buttons, plus one "all of these"
 * button, all carrying a fresh login-free token (lib/responseTokens.ts) — so answering never
 * requires signing in. Volunteers were replying to the old single-link email instead of clicking
 * through to a page that needed a login; the reply-doesn't-count note is there for the same reason.
 * Buttons open a confirm page rather than saving on click, because email security scanners
 * "visit" every link in a message.
 */
async function renderReminderEmail(u: { id: string; name: string }, gaps: AvailabilityGap[]) {
  const token = await createResponseToken(u.id);
  const firstName = u.name.split(' ')[0] || u.name;

  const byDate = new Map<string, string[]>();
  for (const g of gaps) {
    const date = toAppDateKey(g.startAt);
    const names = byDate.get(date) ?? [];
    if (!names.includes(g.eventName)) names.push(g.eventName);
    byDate.set(date, names);
  }
  const dates = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  const link = (dateParam: string, status: 'available' | 'unavailable') =>
    appUrl(`/respond?t=${token}&d=${dateParam}&s=${status}`);
  const label = (date: string) => format(new Date(`${date}T12:00:00Z`), 'EEEE, MMMM d');
  const allDates = dates.map(([d]) => d).join(',');

  const rows = dates
    .map(
      ([date, names]) =>
        `<tr><td style="padding:14px 0;border-top:1px solid ${emailColors.border}"><div style="font-weight:bold;font-size:18px">${escapeHtml(label(date))}</div><div style="color:${emailColors.muted};font-size:15px;margin-bottom:6px">${escapeHtml(names.join(', '))}</div>${emailButton(link(date, 'available'), '✓ I can serve', 'success')}${emailButton(link(date, 'unavailable'), "✗ Can't make it", 'secondary')}</td></tr>`,
    )
    .join('');

  const html = emailLayout(
    `<p style="margin:0 0 12px">Hi ${escapeHtml(firstName)},</p>` +
      `<p style="margin:0 0 16px">Can you help on these dates? <strong>Just tap a button for each date</strong> — no password needed.</p>` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>` +
      (dates.length > 1
        ? `<div style="margin:18px 0 8px;padding-top:14px;border-top:1px solid ${emailColors.border}">${emailButton(link(allDates, 'available'), '✓ I can serve on all of these', 'primary')}</div>`
        : '') +
      `<p style="margin:20px 0 0;padding:12px 14px;background:#fdf1d6;border-radius:8px;font-size:15px"><strong>Please use the buttons above.</strong> Replying to this email does not update the schedule.</p>` +
      `<p style="margin:16px 0 0;font-size:13px;color:${emailColors.muted}">These buttons are just for you and work for ${RESPONSE_TOKEN_TTL_DAYS} days. You can stop these reminders from the Availability page after signing in.</p>`,
  );

  const text = [
    `Hi ${firstName},`,
    '',
    'Can you help on these dates? Open a link below to answer — no password needed.',
    '',
    ...dates.flatMap(([date, names]) => [
      `${label(date)} (${names.join(', ')})`,
      `  I can serve: ${link(date, 'available')}`,
      `  Can't make it: ${link(date, 'unavailable')}`,
      '',
    ]),
    ...(dates.length > 1 ? [`I can serve on all of these: ${link(allDates, 'available')}`, ''] : []),
    'Please use the links above. Replying to this email does not update the schedule.',
  ].join('\n');

  return { subject: 'Can you serve? Tap to answer', html, text };
}

/**
 * Runs daily. Kickoff phase (day-of-month >= 25): starts a new cycle + sends reminder #1 for
 * any active user with no open cycle this month who has unset availability dates in the next
 * 2 months. Followup phase: for every open cycle due (lastSentAt >= 2 days ago, remindersSent
 * < 4), re-scans gaps fresh — resolves if empty, else sends the next reminder and marks
 * exhausted on the 4th if gaps remain. State-driven throughout: a missed run or restart just
 * resumes from what's stored, no in-memory tracking.
 */
export async function runAvailabilityReminderCycle(logger?: ReminderLogger): Promise<ReminderCycleResult> {
  const today = new Date();
  const windowEnd = addMonths(today, WINDOW_MONTHS);
  // Eastern calendar date, not the server clock's, so the month boundary / day-25 kickoff match the church's calendar.
  const todayKey = toAppDateKey(today);
  const cycleMonth = todayKey.slice(0, 7);
  const dayOfMonth = Number(todayKey.slice(8, 10));

  const result: ReminderCycleResult = { kickoffsSent: 0, followupsSent: 0, resolved: 0, exhausted: 0, skipped: false };
  await pruneExpiredResponseTokens();

  // Admins can pause the automatic schedule from /admin/reminders. Checked here rather than in
  // server.ts's cron callback so anything that runs the cycle respects it. While paused, cycles
  // simply don't advance; "Send now" (sendAvailabilityRemindersNow) still works.
  if (!(await isAvailabilityRemindersAutomaticEnabled())) {
    logger?.info({}, 'Automatic availability reminders are turned off; skipping cycle');
    return { ...result, skipped: true };
  }

  if (dayOfMonth >= KICKOFF_DAY_OF_MONTH) {
    const activeUsers = await db.query.user.findMany({
      where: and(eq(user.active, true), eq(user.receiveAvailabilityReminders, true)),
    });
    const existingCycles = await db.query.availabilityReminderCycles.findMany({
      where: eq(availabilityReminderCycles.cycleMonth, cycleMonth),
    });
    const usersWithCycle = new Set(existingCycles.map((c) => c.userId));

    for (const u of activeUsers) {
      if (usersWithCycle.has(u.id)) continue;
      const gaps = await getUnsetAvailabilityDates(u.id, today, windowEnd);
      if (gaps.length === 0) continue;

      await db.insert(availabilityReminderCycles).values({
        id: newId(),
        userId: u.id,
        cycleMonth,
        remindersSent: 1,
        lastSentAt: today,
      });
      await sendMail({ to: u.email, ...(await renderReminderEmail(u, gaps)) });
      result.kickoffsSent++;
    }
  }

  const openCycles = await db.query.availabilityReminderCycles.findMany({
    where: and(isNull(availabilityReminderCycles.resolvedAt), isNull(availabilityReminderCycles.exhaustedAt)),
    with: { user: true },
  });

  for (const cycle of openCycles) {
    if (!cycle.user.active || !cycle.user.receiveAvailabilityReminders) continue;
    if (!cycle.lastSentAt || cycle.remindersSent >= MAX_REMINDERS) continue;
    if (differenceInCalendarDays(today, cycle.lastSentAt) < FOLLOWUP_INTERVAL_DAYS) continue;

    const gaps = await getUnsetAvailabilityDates(cycle.userId, today, windowEnd);
    if (gaps.length === 0) {
      await db
        .update(availabilityReminderCycles)
        .set({ resolvedAt: today })
        .where(eq(availabilityReminderCycles.id, cycle.id));
      result.resolved++;
      continue;
    }

    const remindersSent = cycle.remindersSent + 1;
    const exhausted = remindersSent >= MAX_REMINDERS;
    await db
      .update(availabilityReminderCycles)
      .set({ remindersSent, lastSentAt: today, exhaustedAt: exhausted ? today : null })
      .where(eq(availabilityReminderCycles.id, cycle.id));
    await sendMail({ to: cycle.user.email, ...(await renderReminderEmail(cycle.user, gaps)) });
    result.followupsSent++;
    if (exhausted) result.exhausted++;
  }

  const totalSent = result.kickoffsSent + result.followupsSent;
  if (totalSent > 0) {
    await db.insert(availabilityReminderSends).values({ id: newId(), remindersSent: totalSent, triggeredBy: 'cron' });
  }

  logger?.info({ ...result }, 'Availability reminder cycle complete');
  return result;
}

/**
 * Ad-hoc, admin-triggered nudge — independent of the monthly cycle above (doesn't read or
 * write `availability_reminder_cycles`, so it can't perturb the automated cadence/counts).
 * Sends to every active user with unset availability dates in the next month.
 */
export async function sendAvailabilityRemindersNow(logger?: ReminderLogger): Promise<{ remindersSent: number }> {
  const today = new Date();
  const windowEnd = addMonths(today, MANUAL_WINDOW_MONTHS);

  const activeUsers = await db.query.user.findMany({
    where: and(eq(user.active, true), eq(user.receiveAvailabilityReminders, true)),
  });
  let remindersSent = 0;
  for (const u of activeUsers) {
    const gaps = await getUnsetAvailabilityDates(u.id, today, windowEnd);
    if (gaps.length === 0) continue;
    await sendMail({ to: u.email, ...(await renderReminderEmail(u, gaps)) });
    remindersSent++;
  }

  if (remindersSent > 0) {
    await db.insert(availabilityReminderSends).values({ id: newId(), remindersSent, triggeredBy: 'manual' });
  }

  logger?.info({ remindersSent }, 'Manual availability reminder send complete');
  return { remindersSent };
}

/** Most recent non-empty send (cron or manual), for admin visibility. */
export async function getLastAvailabilityReminderSend() {
  const [last] = await db.query.availabilityReminderSends.findMany({
    orderBy: (t, { desc }) => [desc(t.sentAt)],
    limit: 1,
  });
  return last ?? null;
}
