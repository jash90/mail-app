CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`content_id` text,
	`is_inline` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `labels` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_label_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`color` text,
	`message_count` integer,
	`unread_count` integer
);
--> statement-breakpoint
CREATE TABLE `message_recipients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` text NOT NULL,
	`type` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_recipients_message` ON `message_recipients` (`message_id`);--> statement-breakpoint
CREATE INDEX `idx_recipients_email` ON `message_recipients` (`email`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_message_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`provider_thread_id` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`snippet` text DEFAULT '' NOT NULL,
	`from_email` text NOT NULL,
	`from_name` text,
	`body_text` text DEFAULT '' NOT NULL,
	`body_html` text DEFAULT '' NOT NULL,
	`header_message_id` text,
	`header_in_reply_to` text,
	`header_references` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_messages_thread` ON `messages` (`thread_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_from` ON `messages` (`from_email`);--> statement-breakpoint
CREATE INDEX `idx_messages_account_created` ON `messages` (`account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `participants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_participants_email` ON `participants` (`email`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`account_id` text PRIMARY KEY NOT NULL,
	`history_id` text,
	`last_synced_at` text,
	`next_page_token` text,
	`status` text DEFAULT 'idle' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `thread_labels` (
	`thread_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`thread_id`, `label_id`),
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_thread_labels_label` ON `thread_labels` (`label_id`);--> statement-breakpoint
CREATE TABLE `thread_participants` (
	`thread_id` text NOT NULL,
	`participant_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`thread_id`, `participant_id`),
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_thread_id` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`snippet` text DEFAULT '' NOT NULL,
	`last_message_at` text NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`is_read` integer DEFAULT true NOT NULL,
	`is_starred` integer DEFAULT false NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`is_trashed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_threads_account` ON `threads` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_threads_last_message` ON `threads` (`account_id`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `idx_threads_unread` ON `threads` (`account_id`,`is_read`,`last_message_at`);