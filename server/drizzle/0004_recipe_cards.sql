ALTER TABLE `recipes` ADD `difficulty` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `total_minutes` integer;--> statement-breakpoint
ALTER TABLE `recipes` ADD `image_mime` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `is_favorite` integer DEFAULT false NOT NULL;
