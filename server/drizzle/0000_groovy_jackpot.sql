CREATE TABLE `aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`normalized_name` text NOT NULL,
	`product_id` text NOT NULL,
	`default_serving` text,
	`default_serving_quantity` real,
	`default_amount_g` real,
	`hits` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `aliases_user_id_normalized_name_unique` ON `aliases` (`user_id`,`normalized_name`);--> statement-breakpoint
CREATE TABLE `log_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`yazio_account_id` text NOT NULL,
	`date` text NOT NULL,
	`daytime` text NOT NULL,
	`status` text NOT NULL,
	`items_json` text NOT NULL,
	`consumed_ids_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`yazio_account_id`) REFERENCES `yazio_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `preset_items` (
	`id` text PRIMARY KEY NOT NULL,
	`preset_id` text NOT NULL,
	`position` integer NOT NULL,
	`raw_text` text NOT NULL,
	`product_id` text NOT NULL,
	`serving` text,
	`serving_quantity` real,
	`amount_g` real NOT NULL,
	FOREIGN KEY (`preset_id`) REFERENCES `presets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `presets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `presets_user_id_name_unique` ON `presets` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `yazio_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`yazio_username` text NOT NULL,
	`enc_credentials` text NOT NULL,
	`enc_tokens` text,
	`is_default` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
