CREATE TABLE `contactEmails` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` text,
	`ghlSynced` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contactEmails_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inspections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`inspectionType` varchar(100) NOT NULL,
	`inspectionDate` timestamp NOT NULL,
	`inspectionTime` varchar(20),
	`notes` text,
	`status` enum('pending','scheduled','completed','cancelled') NOT NULL DEFAULT 'pending',
	`ghlSynced` int NOT NULL DEFAULT 0,
	`ghlId` varchar(100),
	`createdBy` varchar(320),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inspections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`opportunityName` text NOT NULL,
	`contactName` text,
	`phone` varchar(50),
	`email` varchar(320),
	`pipeline` text,
	`stage` text,
	`leadValue` text,
	`source` text,
	`assigned` text,
	`createdOn` text,
	`updatedOn` text,
	`lostReasonId` text,
	`lostReasonName` text,
	`followers` text,
	`notes` text,
	`tag` text,
	`address` text,
	`subdivision` text,
	`lotNumber` text,
	`permitNumber` text,
	`assignedPermitTech` text,
	`assignedPlansExaminer` text,
	`assignedInspector` text,
	`lastUpdated` timestamp,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
