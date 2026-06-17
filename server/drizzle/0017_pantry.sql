CREATE TABLE `pantry_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`food_id` text NOT NULL,
	`amount_g` real NOT NULL,
	`expires_at` integer,
	`added_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pantry_user_food_unq` ON `pantry_items` (`user_id`,`food_id`);
--> statement-breakpoint
CREATE INDEX `pantry_user_idx` ON `pantry_items` (`user_id`);
