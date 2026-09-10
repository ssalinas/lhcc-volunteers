CREATE TABLE `availability_reminder_sends` (
	`id` text PRIMARY KEY NOT NULL,
	`reminders_sent` integer NOT NULL,
	`triggered_by` text NOT NULL,
	`sent_at` integer DEFAULT (unixepoch()) NOT NULL
);
