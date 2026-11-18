CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`email` varchar(320),
	`phone` varchar(40),
	`address` text,
	`city` varchar(120),
	`state` varchar(60),
	`zip` varchar(20),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `quotes` ADD `customerId` int;--> statement-breakpoint
ALTER TABLE `quotes` ADD `source` enum('public','internal') DEFAULT 'public' NOT NULL;