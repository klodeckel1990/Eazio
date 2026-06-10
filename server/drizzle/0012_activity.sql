CREATE TABLE `activity_days` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`steps` integer,
	`active_kcal` real,
	`weight_kg` real,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
