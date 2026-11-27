import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { assignments, eventOccurrences, volunteerRoles } from '../db/schema/core.schema.js';

/** Role names are compared trimmed and case-insensitively ("Greeter" == " greeter "). */
export function roleNameKey(name: string) {
  return name.trim().toLowerCase();
}

/**
 * Merges duplicate same-name roles on a single occurrence. How they arise: a role template is
 * removed from an event, but dates where someone was already assigned keep their copy of the
 * role (detached from the template, `sourceTemplateId = null` — see
 * events/service.ts::deleteRoleTemplate). Before addRoleTemplate learned to adopt those, adding
 * the role back put a second, empty copy next to it on exactly those dates.
 *
 * For each occurrence, a group of same-name roles is merged only when exactly one of them is
 * linked to a template and the rest are detached: the detached roles' volunteers move onto the
 * template-linked role (so it follows the event's current team/slot settings), then the detached
 * roles are deleted. Groups with no linked role or several linked roles are left alone — those
 * could be deliberate, and an admin can remove one by hand from the date's page.
 *
 * Idempotent; runs on boot. Pass `eventId` to limit it to one event.
 */
export async function dedupeOccurrenceRoles(eventId?: string) {
  const occurrences = await db.query.eventOccurrences.findMany({
    where: eventId ? eq(eventOccurrences.eventId, eventId) : undefined,
    columns: { id: true },
    with: { roles: { with: { assignments: true } } },
  });

  let rolesMerged = 0;
  let assignmentsMoved = 0;

  for (const occurrence of occurrences) {
    const groups = new Map<string, typeof occurrence.roles>();
    for (const role of occurrence.roles) {
      const key = roleNameKey(role.name);
      groups.set(key, [...(groups.get(key) ?? []), role]);
    }

    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const linked = group.filter((r) => r.sourceTemplateId !== null);
      if (linked.length !== 1) continue;
      const keeper = linked[0];
      const duplicates = group.filter((r) => r.id !== keeper.id);
      const keeperUserIds = new Set(keeper.assignments.map((a) => a.userId));

      db.transaction((tx) => {
        for (const dup of duplicates) {
          for (const a of dup.assignments) {
            // assignments are unique per (role, user) — someone already on the keeper just
            // drops their duplicate row (deleted with the role below).
            if (keeperUserIds.has(a.userId)) continue;
            tx.update(assignments).set({ volunteerRoleId: keeper.id }).where(eq(assignments.id, a.id)).run();
            keeperUserIds.add(a.userId);
            assignmentsMoved++;
          }
        }
        tx.delete(volunteerRoles)
          .where(inArray(volunteerRoles.id, duplicates.map((d) => d.id)))
          .run();
      });
      rolesMerged += duplicates.length;
    }
  }

  return { rolesMerged, assignmentsMoved };
}
