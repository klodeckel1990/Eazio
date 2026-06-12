CREATE TABLE `push_log` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`sent_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `date`, `kind`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
