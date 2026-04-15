CREATE TABLE `ai_token_usage` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `provider` text NOT NULL,
  `model` text NOT NULL,
  `operation` text NOT NULL,
  `prompt_tokens` integer NOT NULL DEFAULT 0,
  `completion_tokens` integer NOT NULL DEFAULT 0,
  `total_tokens` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_token_usage_created` ON `ai_token_usage` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_ai_token_usage_provider` ON `ai_token_usage` (`provider`);
--> statement-breakpoint
CREATE INDEX `idx_ai_token_usage_operation` ON `ai_token_usage` (`operation`);
