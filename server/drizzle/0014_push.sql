CREATE TABLE `push_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`platform` text NOT NULL,
	`apns_env` text,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `push_tokens_token_unique` ON `push_tokens` (`token`);--> statement-breakpoint
CREATE TABLE `push_reminders` (
	`user_id` text PRIMARY KEY NOT NULL,
	`last_sent_date` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
