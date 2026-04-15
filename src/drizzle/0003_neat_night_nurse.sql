ALTER TABLE `messages` ADD `size_estimate` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `is_newsletter` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `messages` ADD `is_auto_reply` integer DEFAULT false;