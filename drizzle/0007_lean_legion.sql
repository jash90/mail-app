CREATE TABLE `ai_token_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`operation` text NOT NULL,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_token_usage_created` ON `ai_token_usage` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_token_usage_provider` ON `ai_token_usage` (`provider`);--> statement-breakpoint
CREATE INDEX `idx_ai_token_usage_operation` ON `ai_token_usage` (`operation`);--> statement-breakpoint
CREATE TABLE `user_actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` text NOT NULL,
	`contact_email` text NOT NULL,
	`thread_id` text,
	`action_type` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_user_actions_account_contact` ON `user_actions` (`account_id`,`contact_email`);--> statement-breakpoint
CREATE INDEX `idx_user_actions_type` ON `user_actions` (`action_type`);