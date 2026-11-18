ALTER TABLE `customers` ADD `hcpCustomerId` varchar(80);--> statement-breakpoint
ALTER TABLE `customers` ADD `hcpLastSyncedAt` timestamp;--> statement-breakpoint
ALTER TABLE `quotes` ADD `hcpCustomerId` varchar(80);--> statement-breakpoint
ALTER TABLE `quotes` ADD `hcpEstimateId` varchar(80);--> statement-breakpoint
ALTER TABLE `quotes` ADD `hcpSyncStatus` varchar(40);--> statement-breakpoint
ALTER TABLE `quotes` ADD `hcpSyncError` text;--> statement-breakpoint
ALTER TABLE `quotes` ADD `hcpLastSyncedAt` timestamp;--> statement-breakpoint
ALTER TABLE `settings` ADD `hcpV2Enabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `hcpLastTestAt` timestamp;--> statement-breakpoint
ALTER TABLE `settings` ADD `hcpLastTestStatus` varchar(80);