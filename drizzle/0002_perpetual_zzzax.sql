ALTER TABLE `settings` ADD `backgroundColor` varchar(20) DEFAULT '#f7f5f0' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `textColor` varchar(20) DEFAULT '#1c1917' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `cardColor` varchar(20) DEFAULT '#ffffff' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `heroImageUrl` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `heroOverlayColor` varchar(20) DEFAULT '#0f4c5c' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `heroOverlayOpacity` int DEFAULT 55 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `heroTagline` varchar(120) DEFAULT 'Instant, transparent pricing' NOT NULL;