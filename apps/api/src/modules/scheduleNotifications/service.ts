import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { newId } from '../../lib/ids.js';
import { sendMail } from '../../lib/mailer.js';
import { formatInAppTimezone } from '../../lib/dates.js';
import { createResponseToken } from '../../lib/responseTokens.js';
import { appUrl, emailButton, emailColors, emailLayout, escapeHtml } from '../../lib/emailLayout.js';
import * as occurrencesService from '../occurrences/service.js';
import * as teamsService from '../teams/service.js';
import {
  eventOccurrences,
  scheduleNotificationBatches,
  scheduleNotificationBatchOccurrences,
  scheduleNotificationRecipients,
} from '../../db/schema/core.schema.js';

interface OccurrenceRoster {
  occurrenceId: string;
  eventName: string;
  startAt: Date;
  location: string | null;
  roles: { teamName: string; roleName: string; assigneeNames: string[]; assigneeUserIds: string[] }[];
}

interface Recipient {
  userId: string;
  name: string;
  email: string;
  occurrences: OccurrenceRoster[];
}

/**
 * Full roster for each date, a "You're serving" callout up top for anyone assigned, and a
 * personal login-free link (lib/responseTokens.ts) to see their own schedule and answer for
 * upcoming dates — most volunteers never sign in, so the email itself has to be enough.
 */
async function renderScheduleEmail(recipient: Recipient) {
  const sorted = [...recipient.occurrences].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const subject =
    sorted.length === 1 ? `Upcoming schedule: ${sorted[0].eventName}` : `Upcoming schedule (${sorted.length} dates)`;
  const firstName = recipient.name.split(' ')[0] || recipient.name;
  const when = (d: Date) => formatInAppTimezone(d, 'EEEE, MMMM d · h:mm a');

  const token = await createResponseToken(recipient.userId);
  const myLink = appUrl(`/respond?t=${token}`);
  const loginLink = appUrl(`/login?email=${encodeURIComponent(recipient.email)}`);

  const mine = sorted.flatMap((o) =>
    o.roles.filter((r) => r.assigneeUserIds.includes(recipient.userId)).map((r) => ({ o, roleName: r.roleName })),
  );

  const servingHtml = mine.length
    ? `<div style="margin:0 0 20px;padding:14px 16px;background:#e3f5ec;border-radius:8px"><div style="font-weight:bold;color:${emailColors.success};margin-bottom:6px">You're scheduled to serve:</div>${mine
        .map(
          ({ o, roleName }) =>
            `<div style="margin:4px 0"><strong>${escapeHtml(roleName)}</strong> — ${escapeHtml(o.eventName)}, ${escapeHtml(when(o.startAt))}</div>`,
        )
        .join('')}<div style="font-size:15px;margin-top:8px">Can't make it? Please reply to this email or call the church office so we can find someone else.</div></div>`
    : '';

  const rosterHtml = sorted
    .map((o) => {
      const rows = o.roles
        .map(
          (r) =>
            `<tr><td style="padding:4px 12px 4px 0;vertical-align:top;white-space:nowrap"><strong>${escapeHtml(r.roleName)}</strong></td><td style="padding:4px 0;vertical-align:top">${
              r.assigneeNames.length
                ? escapeHtml(r.assigneeNames.join(', '))
                : `<span style="color:${emailColors.muted}">not filled yet</span>`
            }</td></tr>`,
        )
        .join('');
      return `<div style="padding:14px 0;border-top:1px solid ${emailColors.border}"><div style="font-weight:bold;font-size:18px">${escapeHtml(o.eventName)}</div><div style="color:${emailColors.muted};font-size:15px;margin-bottom:6px">${escapeHtml(when(o.startAt))}${o.location ? ` · ${escapeHtml(o.location)}` : ''}</div><table role="presentation" cellpadding="0" cellspacing="0" style="font-size:16px">${rows}</table></div>`;
    })
    .join('');

  const html = emailLayout(
    `<p style="margin:0 0 12px">Hi ${escapeHtml(firstName)},</p>` +
      servingHtml +
      `<p style="margin:0 0 4px">Here's who's serving:</p>` +
      rosterHtml +
      `<div style="margin:18px 0 6px;padding-top:14px;border-top:1px solid ${emailColors.border}">${emailButton(myLink, 'See my schedule & availability', 'primary')}</div>` +
      `<p style="margin:6px 0 0;font-size:14px;color:${emailColors.muted}">That button is just for you — no password needed — and works for 30 days. For the full app, <a href="${escapeHtml(loginLink)}" style="color:${emailColors.primary}">sign in here</a>.</p>`,
  );

  const text = [
    `Hi ${firstName},`,
    '',
    ...(mine.length
      ? [
          "You're scheduled to serve:",
          ...mine.map(({ o, roleName }) => `  ${roleName} — ${o.eventName}, ${when(o.startAt)}`),
          "Can't make it? Please reply to this email or call the church office.",
          '',
        ]
      : []),
    "Here's who's serving:",
    '',
    ...sorted.flatMap((o) => [
      `${o.eventName} — ${when(o.startAt)}${o.location ? ` @ ${o.location}` : ''}`,
      ...o.roles.map((r) => `  ${r.roleName} (${r.teamName}): ${r.assigneeNames.length ? r.assigneeNames.join(', ') : 'not filled yet'}`),
      '',
    ]),
    `See your schedule and update your availability (no password needed): ${myLink}`,
  ].join('\n');

  return { subject, text, html };
}

/**
 * Emails everyone active on every team involved in `occurrenceIds` — not just who got
 * assigned — with the full named roster for each selected occurrence, so unpicked team
 * members stay in the loop too. One email per recipient covering every occurrence they're
 * relevant to (cross-occurrence, cross-team dedup), not one email per occurrence/team.
 */
export async function sendScheduleNotifications(occurrenceIds: string[], sentByUserId: string) {
  const occurrences = await Promise.all(occurrenceIds.map((id) => occurrencesService.getOccurrence(id)));

  const recipients = new Map<string, Recipient>();
  const teamMembersCache = new Map<string, Awaited<ReturnType<typeof teamsService.listMembers>>>();

  for (const occurrence of occurrences) {
    const roster: OccurrenceRoster = {
      occurrenceId: occurrence.id,
      eventName: occurrence.event.name,
      startAt: occurrence.startAt,
      location: occurrence.locationOverride ?? occurrence.event.location,
      roles: occurrence.roles.map((r) => ({
        teamName: r.team.name,
        roleName: r.name,
        assigneeNames: r.assignments.filter((a) => a.status !== 'declined').map((a) => a.user.name),
        assigneeUserIds: r.assignments.filter((a) => a.status !== 'declined').map((a) => a.userId),
      })),
    };

    const teamIds = new Set(occurrence.roles.map((r) => r.teamId));
    for (const teamId of teamIds) {
      let members = teamMembersCache.get(teamId);
      if (!members) {
        members = await teamsService.listMembers(teamId);
        teamMembersCache.set(teamId, members);
      }
      // listMembers only filters inactive users for the system team — filter here too so
      // real-team members who've been deactivated never get emailed.
      for (const m of members) {
        if (!m.userActive) continue;
        let recipient = recipients.get(m.userId);
        if (!recipient) {
          recipient = { userId: m.userId, name: m.userName, email: m.userEmail, occurrences: [] };
          recipients.set(m.userId, recipient);
        }
        if (!recipient.occurrences.some((o) => o.occurrenceId === roster.occurrenceId)) {
          recipient.occurrences.push(roster);
        }
      }
    }
  }

  const batchId = newId();
  await db.insert(scheduleNotificationBatches).values({ id: batchId, sentByUserId, recipientCount: recipients.size });
  if (occurrenceIds.length > 0) {
    await db
      .insert(scheduleNotificationBatchOccurrences)
      .values(occurrenceIds.map((eventOccurrenceId) => ({ id: newId(), batchId, eventOccurrenceId })));
  }

  for (const recipient of recipients.values()) {
    await sendMail({ to: recipient.email, ...(await renderScheduleEmail(recipient)) });
    await db.insert(scheduleNotificationRecipients).values({
      id: newId(),
      batchId,
      userId: recipient.userId,
      email: recipient.email,
    });
  }

  return { batchId, recipientCount: recipients.size, occurrenceCount: occurrenceIds.length };
}

/** Most recent notification batch touching each event, keyed by eventId, for admin visibility. */
export async function getLastNotifiedByEvent(): Promise<Record<string, Date>> {
  const rows = await db
    .select({
      eventId: eventOccurrences.eventId,
      lastSentAt: sql<number>`max(${scheduleNotificationBatches.createdAt})`,
    })
    .from(scheduleNotificationBatchOccurrences)
    .innerJoin(eventOccurrences, eq(eventOccurrences.id, scheduleNotificationBatchOccurrences.eventOccurrenceId))
    .innerJoin(scheduleNotificationBatches, eq(scheduleNotificationBatches.id, scheduleNotificationBatchOccurrences.batchId))
    .groupBy(eventOccurrences.eventId);

  const byEvent: Record<string, Date> = {};
  for (const row of rows) {
    byEvent[row.eventId] = new Date(row.lastSentAt * 1000);
  }
  return byEvent;
}
