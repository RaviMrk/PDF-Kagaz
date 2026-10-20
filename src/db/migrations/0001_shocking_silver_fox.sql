CREATE TABLE `folder_stamps` (
	`uri` text PRIMARY KEY NOT NULL,
	`modified_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `files` ADD `parent_uri` text;--> statement-breakpoint
CREATE INDEX `files_parent_uri_idx` ON `files` (`parent_uri`);