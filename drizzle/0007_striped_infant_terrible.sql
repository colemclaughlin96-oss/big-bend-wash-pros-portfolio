ALTER TABLE `settings` ADD `hcpWebhookUrl` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `hcpEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `hcpOnCreate` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `hcpOnAccept` boolean DEFAULT true NOT NULL;