CREATE TABLE `foods` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_id` text,
	`owner_user_id` text,
	`barcode` text,
	`name` text NOT NULL,
	`brand` text,
	`category` text,
	`search_terms` text,
	`base_unit` text DEFAULT 'g' NOT NULL,
	`kcal` real NOT NULL,
	`protein` real,
	`fat` real,
	`saturated_fat` real,
	`carbs` real,
	`sugar` real,
	`fiber` real,
	`salt` real,
	`sodium` real,
	`alcohol` real,
	`nutrients_json` text,
	`servings_json` text,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `foods_source_source_id_unique` ON `foods` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `foods_barcode_idx` ON `foods` (`barcode`);--> statement-breakpoint
CREATE INDEX `foods_owner_idx` ON `foods` (`owner_user_id`);--> statement-breakpoint
CREATE VIRTUAL TABLE `foods_fts` USING fts5(
	`name`, `search_terms`, `brand`,
	content='foods', content_rowid='rowid',
	tokenize='unicode61 remove_diacritics 2'
);--> statement-breakpoint
CREATE TRIGGER `foods_fts_ai` AFTER INSERT ON `foods` BEGIN
	INSERT INTO foods_fts(rowid, name, search_terms, brand) VALUES (new.rowid, new.name, new.search_terms, new.brand);
END;--> statement-breakpoint
CREATE TRIGGER `foods_fts_ad` AFTER DELETE ON `foods` BEGIN
	INSERT INTO foods_fts(foods_fts, rowid, name, search_terms, brand) VALUES ('delete', old.rowid, old.name, old.search_terms, old.brand);
END;--> statement-breakpoint
CREATE TRIGGER `foods_fts_au` AFTER UPDATE ON `foods` BEGIN
	INSERT INTO foods_fts(foods_fts, rowid, name, search_terms, brand) VALUES ('delete', old.rowid, old.name, old.search_terms, old.brand);
	INSERT INTO foods_fts(rowid, name, search_terms, brand) VALUES (new.rowid, new.name, new.search_terms, new.brand);
END;
