import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, projects, inspections, contactEmails, projectFiles, InsertProject, InsertInspection, InsertContactEmail, InsertProjectFile } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "company"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string, loginMethod?: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  // Get all users with this email
  const allResults = await db.select().from(users).where(eq(users.email, email));
  
  if (allResults.length === 0) {
    return undefined;
  }
  
  // If loginMethod specified, filter by that first
  if (loginMethod) {
    const filtered = allResults.filter(u => u.loginMethod === loginMethod);
    if (filtered.length > 0) {
      return filtered[0];
    }
  }
  
  // Prioritize users with passwords (local auth)
  const withPassword = allResults.filter(u => u.password !== null);
  if (withPassword.length > 0) {
    return withPassword[0];
  }
  
  // Fall back to first result
  return allResults[0];
}

// Project queries
export async function getProjectsByEmail(email: string) {
  const db = await getDb();
  if (!db) return [];

  const result = await db.select().from(projects).where(eq(projects.email, email));
  return result;
}

export async function getProjectById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function syncProject(project: InsertProject) {
  const db = await getDb();
  if (!db) return;

  await db.insert(projects).values(project).onDuplicateKeyUpdate({
    set: project,
  });
}

export async function syncAllProjects(projectList: InsertProject[]) {
  const db = await getDb();
  if (!db) return;

  // Clear existing projects and insert new ones
  await db.delete(projects);
  
  if (projectList.length > 0) {
    await db.insert(projects).values(projectList);
  }
}

// Inspection queries
export async function getInspectionsByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) return [];

  const result = await db.select().from(inspections).where(eq(inspections.projectId, projectId));
  return result;
}

export async function createInspection(inspection: InsertInspection, project?: { opportunityName?: string | null; address?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const inspectionData = {
    ...inspection,
    projectName: project?.opportunityName || null,
    projectAddress: project?.address || null,
  };
  
  await db.insert(inspections).values(inspectionData);
}

export async function updateInspection(id: number, updates: Partial<InsertInspection>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(inspections).set(updates).where(eq(inspections.id, id));
}

// Contact email queries
export async function getContactEmailsByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) return [];

  const result = await db.select().from(contactEmails).where(eq(contactEmails.projectId, projectId));
  return result;
}

export async function createContactEmail(contact: InsertContactEmail) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(contactEmails).values(contact);
  return result;
}

export async function deleteContactEmail(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(contactEmails).where(eq(contactEmails.id, id));
}

// Project Files Management
export async function createProjectFile(file: InsertProjectFile) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(projectFiles).values(file);
}

export async function getProjectFiles(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(projectFiles).where(eq(projectFiles.projectId, projectId));
}

export async function deleteProjectFile(fileId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(projectFiles).where(eq(projectFiles.id, fileId));
}
