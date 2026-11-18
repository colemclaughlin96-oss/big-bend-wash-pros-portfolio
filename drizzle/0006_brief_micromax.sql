CREATE TABLE `teamUsers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(200),
	`passwordHash` text,
	`role` enum('admin','member') NOT NULL DEFAULT 'member',
	`status` enum('invited','active') NOT NULL DEFAULT 'invited',
	`inviteToken` varchar(64),
	`inviteExpiresAt` timestamp,
	`lastLoginAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teamUsers_id` PRIMARY KEY(`id`),
	CONSTRAINT `teamUsers_email_unique` UNIQUE(`email`)
);
