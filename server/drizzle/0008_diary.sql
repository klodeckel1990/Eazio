CREATE TABLE `diary_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`daytime` text NOT NULL,
	`food_id` text,
	`name_snapshot` text NOT NULL,
	`amount_g` real NOT NULL,
	`serving_label` text,
	`serving_quantity` real,
	`kcal` real NOT NULL,
	`protein` real,
	`fat` real,
	`carbs` real,
	`sugar` real,
	`fiber` real,
	`origin` text NOT NULL,
	`origin_ref_id` text,
	`mirror_status` text,
	`mirror_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX `diary_user_date_idx` ON `diary_entries` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `diary_mirror_idx` ON `diary_entries` (`mirror_status`);--> statement-breakpoint
CREATE TABLE `water_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`ml` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX `water_user_date_idx` ON `water_entries` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `user_goals` (
	`user_id` text PRIMARY KEY NOT NULL,
	`kcal_target` integer DEFAULT 2000 NOT NULL,
	`protein_g` real,
	`fat_g` real,
	`carbs_g` real,
	`water_ml` integer DEFAULT 2000 NOT NULL,
	`weight_kg` real,
	`weight_goal_kg` real,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE TABLE `user_stats` (
	`user_id` text PRIMARY KEY NOT NULL,
	`current_streak` integer DEFAULT 0 NOT NULL,
	`longest_streak` integer DEFAULT 0 NOT NULL,
	`last_logged_date` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE TABLE `food_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`normalized_name` text NOT NULL,
	`food_id` text NOT NULL,
	`default_amount_g` real,
	`default_serving_label` text,
	`hits` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `food_aliases_user_name_unique` ON `food_aliases` (`user_id`,`normalized_name`);
