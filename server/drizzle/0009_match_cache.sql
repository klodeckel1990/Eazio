CREATE TABLE `match_cache` (
	`normalized_name` text PRIMARY KEY NOT NULL,
	`food_id` text NOT NULL,
	`hits` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action
);
