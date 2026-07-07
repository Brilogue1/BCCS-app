CREATE TABLE `requiredInspections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`permitType` varchar(255) NOT NULL,
	`subType` varchar(255) NOT NULL,
	`section` varchar(100) NOT NULL DEFAULT 'BUILDING',
	`inspectionName` varchar(255) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`addedBy` varchar(320),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `requiredInspections_id` PRIMARY KEY(`id`)
);
