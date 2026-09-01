import { format } from 'date-fns';
import { db } from '../../db/client.js';
import { newId } from '../../lib/ids.js';
import { sendMail } from '../../lib/mailer.js';
import * as occurrencesService from '../occurrences/service.js';
import * as teamsService from '../teams/service.js';
import {
  scheduleNotificationBatches,
  scheduleNotificationBatchOccurrences,
  scheduleNotificationRecipients,
} from '../../db/schema/core.schema.js';

interface OccurrenceRoster {
  occurrenceId: string;
  eventName: string;
  startAt: Date;
  location: string | null;
  roles: { teamName: string; roleName: string; assigneeNames: string[] }[];
}

interface Recipient {
  userId: string;
  name: string;
  email: string;
  occurrences: OccurrenceRoster[];
}

function renderScheduleEmail(recipient: Recipient) {
  const sorted = [...recipient.occurrences].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const subject =
    sorted.length === 1 ? `Upcoming schedule: ${sorted[0].eventName}` : `Upcoming schedule (${sorted.length} dates)`;

  const textBlocks = sorted.map((o) => {
    const roleLines = o.roles
      .map(
        (r) =>
          `  ${r.roleName} (${r.teamName}): ${r.assigneeNames.length ? r.assigneeNames.join(', ') : 'unfilled'}`,
      )
      .join('\n');
    return `${o.eventName} — ${format(o.startAt, 'EEE, MMM d, p')}${o.location ? ` @ ${o.location}` : ''}\n${roleLines}`;
  });
  const text = `Hi ${recipient.name},\n\nHere's the upcoming schedule:\n\n${textBlocks.join('\n\n')}\n`;

  const htmlBlocks = sorted.map((o) => {
    const roleItems = o.roles
      .map(
        (r) =>
          `<li><strong>${r.roleName}</strong> (${r.teamName}): ${
            r.assigneeNames.length ? r.assigneeNames.join(', ') : 'unfilled'
          }</li>`,
      )
      .join('');
    return `<p><strong>${o.eventName}</strong> — ${format(o.startAt, 'EEE, MMM d, p')}${
      o.location ? ` @ ${o.location}` : ''
    }</p><ul>${roleItems}</ul>`;
  });
  const html = `<p>Hi ${recipient.name},</p><p>Here's the upcoming schedule:</p>${htmlBlocks.join('')}`;

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
    await sendMail({ to: recipient.email, ...renderScheduleEmail(recipient) });
    await db.insert(scheduleNotificationRecipients).values({
      id: newId(),
      batchId,
      userId: recipient.userId,
      email: recipient.email,
    });
  }

  return { batchId, recipientCount: recipients.size, occurrenceCount: occurrenceIds.length };
}
