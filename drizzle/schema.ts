import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extended with custom authentication fields for Google Sheets login.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  password: varchar("password", { length: 255 }), // Hashed password
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  company: text("company"), // Company assignment ("ALL" for admin access to all, or specific company name)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Projects table - synced from Google Sheets
 */
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  opportunityName: text("opportunityName").notNull(),
  contactName: text("contactName"),
  phone: varchar("phone", { length: 100 }),
  email: varchar("email", { length: 320 }),
  pipeline: text("pipeline"),
  stage: text("stage"),
  leadValue: text("leadValue"),
  source: text("source"),
  assigned: text("assigned"),
  createdOn: text("createdOn"),
  updatedOn: text("updatedOn"),
  lostReasonId: text("lostReasonId"),
  lostReasonName: text("lostReasonName"),
  followers: text("followers"),
  notes: text("notes"),
  tag: text("tag"),
  // Additional fields from Google Sheets (to be populated)
  address: text("address"),
  subdivision: text("subdivision"),
  lotNumber: text("lotNumber"),
  permitNumber: text("permitNumber"),
  assignedPermitTech: text("assignedPermitTech"),
  assignedPlansExaminer: text("assignedPlansExaminer"),
  assignedInspector: text("assignedInspector"),
  planningChecklist: text("planningChecklist"), // Column AC - task status for progress tracking
  permittingChecklist: text("permittingChecklist"), // Column AD - permitting task status
  inspectionChecklist: text("inspectionChecklist"), // Column AY - inspection task status
  inspection1Result: text("inspection1Result"), // Column Z - 1st Inspection Results (Approved/Denied/Partial)
  inspection2Result: text("inspection2Result"), // Column AA - 2nd Inspection Results
  inspection3Result: text("inspection3Result"), // Column AB - 3rd Inspection Results
  proposalSent: text("proposalSent"), // Column AZ - Proposals Sent (Yes/empty)
  proposalSigned: text("proposalSigned"), // Column BA - Proposal Signed (Yes/No/empty)
  company: text("company"), // Column BB - company assignment for filtering
  completionStatus: text("completionStatus"), // Column F - Completed/Active status for filtering
  inspection1Type: text("inspection1Type"), // Column U - Inspection Type 1
  inspection2Type: text("inspection2Type"), // Column V - Inspection Type 2
  inspection3Type: text("inspection3Type"), // Column W - Inspection Type 3
  inspection4Type: text("inspection4Type"), // Column X - Inspection Type 4
  inspection5Type: text("inspection5Type"), // Column Y - Inspection Type 5
  opportunityId: varchar("opportunityId", { length: 100 }), // Column AQ - Opportunity ID for system integration
  lastUpdated: timestamp("lastUpdated"),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

/**
 * Inspections table - stores scheduled inspections
 */
export const inspections = mysqlTable("inspections", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  projectName: varchar("projectName", { length: 500 }),
  projectAddress: varchar("projectAddress", { length: 500 }),
  opportunityId: varchar("opportunityId", { length: 100 }),
  inspectionType: varchar("inspectionType", { length: 255 }).notNull(),
  notes: text("notes"),
  status: mysqlEnum("status", ["pending", "scheduled", "completed", "cancelled"]).default("pending").notNull(),
  ghlSynced: int("ghlSynced").default(0).notNull(), // 0 = not synced, 1 = synced
  ghlId: varchar("ghlId", { length: 100 }),
  createdBy: varchar("createdBy", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Inspection = typeof inspections.$inferSelect;
export type InsertInspection = typeof inspections.$inferInsert;

/**
 * Contact emails table - manages additional emails for projects
 */
export const contactEmails = mysqlTable("contactEmails", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  name: text("name"),
  ghlSynced: int("ghlSynced").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ContactEmail = typeof contactEmails.$inferSelect;
export type InsertContactEmail = typeof contactEmails.$inferInsert;

/**
 * Project files table - stores uploaded files for projects
 */
export const projectFiles = mysqlTable("projectFiles", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  fileName: varchar("fileName", { length: 500 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  fileSize: int("fileSize"),
  mimeType: varchar("mimeType", { length: 100 }),
  uploadedBy: varchar("uploadedBy", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProjectFile = typeof projectFiles.$inferSelect;
export type InsertProjectFile = typeof projectFiles.$inferInsert;
