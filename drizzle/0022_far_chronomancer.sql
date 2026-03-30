CREATE TABLE `inspectionReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectName` varchar(500) NOT NULL,
	`inspectionType` varchar(255) NOT NULL,
	`approvedStatus` varchar(100),
	`dateApproved` varchar(100),
	`inspectorName` varchar(255),
	`company` varchar(255),
	`opportunityId` varchar(100),
	`reportUrl` text NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`sheetRowIndex` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inspectionReports_id` PRIMARY KEY(`id`)
);
