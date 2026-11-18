ALTER TABLE `quotes` MODIFY COLUMN `status` enum('draft','pending','accepted','declined','expired') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `quotes` ADD `sentAt` timestamp;