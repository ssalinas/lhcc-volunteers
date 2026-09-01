import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { user } from './auth.schema.js';

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
};

// ---------- Teams ----------

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  // System teams (currently just the auto-provisioned "All Volunteers" team) have no real
  // team_memberships rows — every active user is implicitly a member. See
  // modules/scheduling/fairness.ts and jobs/ensureSystemTeams.ts.
  isSystemTeam: integer('is_system_team', { mode: 'boolean' }).notNull().default(false),
  ...timestamps,
});

export const teamMemberships = sqliteTable(
  'team_memberships',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    joinedAt: integer('joined_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex('team_memberships_team_user_idx').on(t.teamId, t.userId)],
);

// ---------- Events ----------

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  location: text('location'),
  defaultStartTime: text('default_start_time').notNull(), // "HH:mm"
  defaultDurationMinutes: integer('default_duration_minutes').notNull().default(60),
  timezone: text('timezone').notNull().default('America/New_York'),
  isRecurring: integer('is_recurring', { mode: 'boolean' }).notNull().default(false),
  rrule: text('rrule'),
  dtstart: integer('dtstart', { mode: 'timestamp' }),
  recurrenceEndDate: text('recurrence_end_date'), // ISO date, nullable = no end
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const eventRoleTemplates = sqliteTable('event_role_templates', {
  id: text('id').primaryKey(),
  eventId: text('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  teamId: text('team_id')
    .notNull()
    .references(() => teams.id),
  name: text('name').notNull(),
  slotsCount: integer('slots_count').notNull().default(1),
  stackable: integer('stackable', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const eventOccurrences = sqliteTable(
  'event_occurrences',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    startAt: integer('start_at', { mode: 'timestamp' }).notNull(),
    endAt: integer('end_at', { mode: 'timestamp' }).notNull(),
    status: text('status', { enum: ['scheduled', 'canceled'] })
      .notNull()
      .default('scheduled'),
    locationOverride: text('location_override'),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex('event_occurrences_event_start_idx').on(t.eventId, t.startAt),
    index('event_occurrences_start_idx').on(t.startAt),
  ],
);

export const volunteerRoles = sqliteTable('volunteer_roles', {
  id: text('id').primaryKey(),
  eventOccurrenceId: text('event_occurrence_id')
    .notNull()
    .references(() => eventOccurrences.id, { onDelete: 'cascade' }),
  teamId: text('team_id')
    .notNull()
    .references(() => teams.id),
  name: text('name').notNull(),
  slotsCount: integer('slots_count').notNull().default(1),
  stackable: integer('stackable', { mode: 'boolean' }).notNull().default(false),
  sourceTemplateId: text('source_template_id').references(() => eventRoleTemplates.id, {
    onDelete: 'set null',
  }),
});

// ---------- Availability ----------

export const availability = sqliteTable(
  'availability',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    startDate: text('start_date').notNull(), // ISO date (YYYY-MM-DD)
    endDate: text('end_date').notNull(),
    status: text('status', { enum: ['available', 'unavailable'] })
      .notNull()
      .default('available'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('availability_user_idx').on(t.userId)],
);

// ---------- Assignments ----------

export const assignments = sqliteTable(
  'assignments',
  {
    id: text('id').primaryKey(),
    volunteerRoleId: text('volunteer_role_id')
      .notNull()
      .references(() => volunteerRoles.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['scheduled', 'confirmed', 'declined', 'completed'] })
      .notNull()
      .default('scheduled'),
    assignedByUserId: text('assigned_by_user_id').references(() => user.id),
    assignedAt: integer('assigned_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    respondedAt: integer('responded_at', { mode: 'timestamp' }),
    notes: text('notes'),
  },
  (t) => [
    uniqueIndex('assignments_role_user_idx').on(t.volunteerRoleId, t.userId),
    index('assignments_user_idx').on(t.userId),
  ],
);

// ---------- Availability Reminders ----------

export const availabilityReminderCycles = sqliteTable(
  'availability_reminder_cycles',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // "YYYY-MM" — the month this cycle kicked off in.
    cycleMonth: text('cycle_month').notNull(),
    remindersSent: integer('reminders_sent').notNull().default(0),
    lastSentAt: integer('last_sent_at', { mode: 'timestamp' }),
    // Set when a re-scan finds no more unset dates — cycle ended successfully.
    resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
    // Set when remindersSent hits 4 and gaps still remain — cycle ended without resolving.
    exhaustedAt: integer('exhausted_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex('availability_reminder_cycles_user_month_idx').on(t.userId, t.cycleMonth),
    index('availability_reminder_cycles_user_idx').on(t.userId),
  ],
);

// ---------- Schedule Notifications ----------

export const scheduleNotificationBatches = sqliteTable('schedule_notification_batches', {
  id: text('id').primaryKey(),
  sentByUserId: text('sent_by_user_id')
    .notNull()
    .references(() => user.id),
  recipientCount: integer('recipient_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const scheduleNotificationBatchOccurrences = sqliteTable(
  'schedule_notification_batch_occurrences',
  {
    id: text('id').primaryKey(),
    batchId: text('batch_id')
      .notNull()
      .references(() => scheduleNotificationBatches.id, { onDelete: 'cascade' }),
    eventOccurrenceId: text('event_occurrence_id')
      .notNull()
      .references(() => eventOccurrences.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('sched_notif_batch_occ_idx').on(t.batchId, t.eventOccurrenceId)],
);

export const scheduleNotificationRecipients = sqliteTable(
  'schedule_notification_recipients',
  {
    id: text('id').primaryKey(),
    batchId: text('batch_id')
      .notNull()
      .references(() => scheduleNotificationBatches.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    email: text('email').notNull(), // snapshot at send time
    sentAt: integer('sent_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [uniqueIndex('sched_notif_recipients_batch_user_idx').on(t.batchId, t.userId)],
);

// ---------- Relations ----------

export const teamsRelations = relations(teams, ({ many }) => ({
  memberships: many(teamMemberships),
  roleTemplates: many(eventRoleTemplates),
  volunteerRoles: many(volunteerRoles),
}));

export const teamMembershipsRelations = relations(teamMemberships, ({ one }) => ({
  team: one(teams, { fields: [teamMemberships.teamId], references: [teams.id] }),
  user: one(user, { fields: [teamMemberships.userId], references: [user.id] }),
}));

export const eventsRelations = relations(events, ({ many }) => ({
  roleTemplates: many(eventRoleTemplates),
  occurrences: many(eventOccurrences),
}));

export const eventRoleTemplatesRelations = relations(eventRoleTemplates, ({ one }) => ({
  event: one(events, { fields: [eventRoleTemplates.eventId], references: [events.id] }),
  team: one(teams, { fields: [eventRoleTemplates.teamId], references: [teams.id] }),
}));

export const eventOccurrencesRelations = relations(eventOccurrences, ({ one, many }) => ({
  event: one(events, { fields: [eventOccurrences.eventId], references: [events.id] }),
  roles: many(volunteerRoles),
}));

export const volunteerRolesRelations = relations(volunteerRoles, ({ one, many }) => ({
  occurrence: one(eventOccurrences, {
    fields: [volunteerRoles.eventOccurrenceId],
    references: [eventOccurrences.id],
  }),
  team: one(teams, { fields: [volunteerRoles.teamId], references: [teams.id] }),
  sourceTemplate: one(eventRoleTemplates, {
    fields: [volunteerRoles.sourceTemplateId],
    references: [eventRoleTemplates.id],
  }),
  assignments: many(assignments),
}));

export const availabilityRelations = relations(availability, ({ one }) => ({
  user: one(user, { fields: [availability.userId], references: [user.id] }),
}));

export const assignmentsRelations = relations(assignments, ({ one }) => ({
  volunteerRole: one(volunteerRoles, {
    fields: [assignments.volunteerRoleId],
    references: [volunteerRoles.id],
  }),
  user: one(user, { fields: [assignments.userId], references: [user.id] }),
  assignedBy: one(user, { fields: [assignments.assignedByUserId], references: [user.id] }),
}));

export const availabilityReminderCyclesRelations = relations(availabilityReminderCycles, ({ one }) => ({
  user: one(user, { fields: [availabilityReminderCycles.userId], references: [user.id] }),
}));

export const scheduleNotificationBatchesRelations = relations(scheduleNotificationBatches, ({ many }) => ({
  occurrences: many(scheduleNotificationBatchOccurrences),
  recipients: many(scheduleNotificationRecipients),
}));

export const scheduleNotificationBatchOccurrencesRelations = relations(
  scheduleNotificationBatchOccurrences,
  ({ one }) => ({
    batch: one(scheduleNotificationBatches, {
      fields: [scheduleNotificationBatchOccurrences.batchId],
      references: [scheduleNotificationBatches.id],
    }),
    occurrence: one(eventOccurrences, {
      fields: [scheduleNotificationBatchOccurrences.eventOccurrenceId],
      references: [eventOccurrences.id],
    }),
  }),
);

export const scheduleNotificationRecipientsRelations = relations(scheduleNotificationRecipients, ({ one }) => ({
  batch: one(scheduleNotificationBatches, {
    fields: [scheduleNotificationRecipients.batchId],
    references: [scheduleNotificationBatches.id],
  }),
  user: one(user, { fields: [scheduleNotificationRecipients.userId], references: [user.id] }),
}));
