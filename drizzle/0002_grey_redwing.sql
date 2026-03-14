CREATE TABLE `model_state` (
	`model_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`file_path` text NOT NULL,
	`file_size` integer NOT NULL,
	`downloaded_at` text NOT NULL
);
