ALTER TABLE `settings` ADD `ghlApiToken` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `ghlLocationId` varchar(80);--> statement-breakpoint
ALTER TABLE `settings` ADD `ghlPipelineId` varchar(80);--> statement-breakpoint
ALTER TABLE `settings` ADD `ghlPipelineName` varchar(200);--> statement-breakpoint
ALTER TABLE `settings` ADD `ghlStageSentId` varchar(80);--> statement-breakpoint
ALTER TABLE `settings` ADD `ghlStageAcceptedId` varchar(80);--> statement-breakpoint
ALTER TABLE `settings` ADD `ghlStageDeclinedId` varchar(80);--> statement-breakpoint
ALTER TABLE `settings` ADD `ghlEstimateFieldId` varchar(80);--> statement-breakpoint
ALTER TABLE `settings` ADD `ghlV2Enabled` boolean DEFAULT false NOT NULL;