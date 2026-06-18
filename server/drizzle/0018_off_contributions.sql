CREATE TABLE `off_contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`food_id` text NOT NULL,
	`barcode` text NOT NULL,
	`status` text NOT NULL,
	`off_status` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `off_contrib_food_unq` ON `off_contributions` (`food_id`);
--> statement-breakpoint
CREATE INDEX `off_contrib_user_idx` ON `off_contributions` (`user_id`);
