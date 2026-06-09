ALTER TABLE `sessions` ADD `token_hash` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `kind` text DEFAULT 'cookie' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `device_name` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `platform` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `created_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `last_used_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);
