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
