ALTER TABLE `inspections` MODIFY COLUMN `inspectionType` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `inspections` ADD `projectName` varchar(500);--> statement-breakpoint
ALTER TABLE `inspections` ADD `projectAddress` varchar(500);--> statement-breakpoint
ALTER TABLE `inspections` DROP COLUMN `inspectionDate`;--> statement-breakpoint
ALTER TABLE `inspections` DROP COLUMN `inspectionTime`;