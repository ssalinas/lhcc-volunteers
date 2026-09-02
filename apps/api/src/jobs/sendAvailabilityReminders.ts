import { addMonths, differenceInCalendarDays, format } from 'date-fns';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { user } from '../db/schema/auth.schema.js';
import { availabilityReminderCycles } from '../db/schema/core.schema.js';
import { getUnsetAvailabilityDates, type AvailabilityGap } from '../modules/scheduling/availabilityGaps.js';
import { sendMail } from '../lib/mailer.js';
import { newId } from '../lib/ids.js';
import { env } from '../config/env.js';

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
}

function renderReminderEmail(userName: string, gaps: AvailabilityGap[]) {
  const link = `${env.BETTER_AUTH_URL}/availability`;
  const dateLines = gaps.map((g) => `${format(g.startAt, 'EEE, MMM d')} — ${g.eventName}`);
  return {
    subject: 'Please update your availability',
    text: `Hi ${userName},\n\nYou have upcoming dates that need your availability set:\n\n${dateLines
      .map((l) => `- ${l}`)
      .join('\n')}\n\nUpdate here: ${link}\n`,
    html: `<p>Hi ${userName},</p><p>You have upcoming dates that need your availability set:</p><ul>${dateLines
      .map((l) => `<li>${l}</li>`)
      .join('')}</ul><p><a href="${link}">Update your availability</a></p>`,
  };
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
  const cycleMonth = format(today, 'yyyy-MM');

  const result: ReminderCycleResult = { kickoffsSent: 0, followupsSent: 0, resolved: 0, exhausted: 0 };

  if (today.getDate() >= KICKOFF_DAY_OF_MONTH) {
    const activeUsers = await db.query.user.findMany({ where: eq(user.active, true) });
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
      await sendMail({ to: u.email, ...renderReminderEmail(u.name, gaps) });
      result.kickoffsSent++;
    }
  }

  const openCycles = await db.query.availabilityReminderCycles.findMany({
    where: and(isNull(availabilityReminderCycles.resolvedAt), isNull(availabilityReminderCycles.exhaustedAt)),
    with: { user: true },
  });

  for (const cycle of openCycles) {
    if (!cycle.user.active) continue;
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
    await sendMail({ to: cycle.user.email, ...renderReminderEmail(cycle.user.name, gaps) });
    result.followupsSent++;
    if (exhausted) result.exhausted++;
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

  const activeUsers = await db.query.user.findMany({ where: eq(user.active, true) });
  let remindersSent = 0;
  for (const u of activeUsers) {
    const gaps = await getUnsetAvailabilityDates(u.id, today, windowEnd);
    if (gaps.length === 0) continue;
    await sendMail({ to: u.email, ...renderReminderEmail(u.name, gaps) });
    remindersSent++;
  }

  logger?.info({ remindersSent }, 'Manual availability reminder send complete');
  return { remindersSent };
}
