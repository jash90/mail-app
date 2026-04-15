PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_thread_participants` (
	`thread_id` text NOT NULL,
	`participant_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`thread_id`, `participant_id`),
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_thread_participants`("thread_id", "participant_id", "position") SELECT "thread_id", "participant_id", "position" FROM `thread_participants`;--> statement-breakpoint
DROP TABLE `thread_participants`;--> statement-breakpoint
ALTER TABLE `__new_thread_participants` RENAME TO `thread_participants`;--> statement-breakpoint
CREATE TABLE `__new_thread_labels` (
	`thread_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`thread_id`, `label_id`),
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_thread_labels`("thread_id", "label_id") SELECT "thread_id", "label_id" FROM `thread_labels`;--> statement-breakpoint
DROP TABLE `thread_labels`;--> statement-breakpoint
ALTER TABLE `__new_thread_labels` RENAME TO `thread_labels`;--> statement-breakpoint
CREATE INDEX `idx_thread_labels_label` ON `thread_labels` (`label_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;