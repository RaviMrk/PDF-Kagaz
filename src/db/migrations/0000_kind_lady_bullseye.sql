CREATE TABLE `bookmarks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_id` text NOT NULL,
	`page` integer NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmarks_file_id_idx` ON `bookmarks` (`file_id`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`uri` text NOT NULL,
	`name` text NOT NULL,
	`folder` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`modified_at` integer NOT NULL,
	`page_count` integer,
	`thumb_path` text,
	`is_encrypted` integer DEFAULT false NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`last_page` integer,
	`last_opened_at` integer,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_uri_unique` ON `files` (`uri`);--> statement-breakpoint
CREATE INDEX `files_folder_idx` ON `files` (`folder`);--> statement-breakpoint
CREATE INDEX `files_is_favorite_idx` ON `files` (`is_favorite`);--> statement-breakpoint
CREATE INDEX `files_last_opened_at_idx` ON `files` (`last_opened_at`);--> statement-breakpoint
CREATE TABLE `scan_roots` (
	`uri` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`added_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `signatures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`png_path` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tool_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`tool_id` text NOT NULL,
	`input_ids` text NOT NULL,
	`options` text NOT NULL,
	`status` text NOT NULL,
	`output_uri` text,
	`error` text,
	`started_at` integer NOT NULL,
	`finished_at` integer
);
