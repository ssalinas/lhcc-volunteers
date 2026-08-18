CREATE TABLE `availability_reminder_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cycle_month` text NOT NULL,
	`reminders_sent` integer DEFAULT 0 NOT NULL,
	`last_sent_at` integer,
	`resolved_at` integer,
	`exhausted_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `availability_reminder_cycles_user_month_idx` ON `availability_reminder_cycles` (`user_id`,`cycle_month`);--> statement-breakpoint
CREATE INDEX `availability_reminder_cycles_user_idx` ON `availability_reminder_cycles` (`user_id`);