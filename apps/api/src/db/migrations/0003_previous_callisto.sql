CREATE TABLE `schedule_notification_batch_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`event_occurrence_id` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `schedule_notification_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_occurrence_id`) REFERENCES `event_occurrences`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sched_notif_batch_occ_idx` ON `schedule_notification_batch_occurrences` (`batch_id`,`event_occurrence_id`);--> statement-breakpoint
CREATE TABLE `schedule_notification_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`sent_by_user_id` text NOT NULL,
	`recipient_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`sent_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `schedule_notification_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`sent_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `schedule_notification_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sched_notif_recipients_batch_user_idx` ON `schedule_notification_recipients` (`batch_id`,`user_id`);