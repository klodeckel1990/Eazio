CREATE TABLE `subscriptions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'none' NOT NULL,
	`premium_until` integer,
	`product_id` text,
	`store` text,
	`rc_app_user_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `usage_user_kind_idx` ON `usage_events` (`user_id`,`kind`,`created_at`);
