ALTER TABLE `settings` MODIFY COLUMN `companyName` varchar(200) NOT NULL DEFAULT 'Example Home Services';--> statement-breakpoint
ALTER TABLE `settings` MODIFY COLUMN `primaryColor` varchar(20) NOT NULL DEFAULT '#3FA34D';--> statement-breakpoint
ALTER TABLE `settings` MODIFY COLUMN `accentColor` varchar(20) NOT NULL DEFAULT '#5E8DB7';--> statement-breakpoint
ALTER TABLE `settings` MODIFY COLUMN `backgroundColor` varchar(20) NOT NULL DEFAULT '#f4faf3';--> statement-breakpoint
ALTER TABLE `settings` MODIFY COLUMN `textColor` varchar(20) NOT NULL DEFAULT '#14241a';--> statement-breakpoint
ALTER TABLE `settings` MODIFY COLUMN `heroOverlayColor` varchar(20) NOT NULL DEFAULT '#14503a';--> statement-breakpoint
ALTER TABLE `settings` MODIFY COLUMN `formHeadline` varchar(200) NOT NULL DEFAULT 'Get Your Instant Cleaning Quote';--> statement-breakpoint
ALTER TABLE `settings` MODIFY COLUMN `heroTagline` varchar(120) NOT NULL DEFAULT 'Eco-friendly cleaning, instant pricing';--> statement-breakpoint
ALTER TABLE `customers` ADD `company` varchar(200);--> statement-breakpoint
ALTER TABLE `customers` ADD `altPhone` varchar(40);--> statement-breakpoint
ALTER TABLE `customers` ADD `okToText` boolean;--> statement-breakpoint
ALTER TABLE `customers` ADD `leadSource` varchar(120);--> statement-breakpoint
ALTER TABLE `quotes` ADD `customerCompany` varchar(200);--> statement-breakpoint
ALTER TABLE `quotes` ADD `customerAltPhone` varchar(40);--> statement-breakpoint
ALTER TABLE `quotes` ADD `okToText` boolean;--> statement-breakpoint
ALTER TABLE `quotes` ADD `leadSource` varchar(120);--> statement-breakpoint
ALTER TABLE `quotes` ADD `projectType` enum('residential','commercial');--> statement-breakpoint
ALTER TABLE `quotes` ADD `floors` varchar(40);--> statement-breakpoint
ALTER TABLE `quotes` ADD `discountGroup` varchar(80);