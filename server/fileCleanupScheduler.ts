/**
 * File Cleanup Scheduler
 *
 * Runs once daily at 2:00 AM UTC and deletes uploaded project files
 * (documents & photos) that are older than 14 days from both S3 and the database.
 *
 * Cron: "0 2 * * *" = every day at 02:00 UTC
 */

import cron from "node-cron";
import { storageDelete } from "./storage";
import * as db from "./db";
import { projectFiles } from "../drizzle/schema";
import { lt } from "drizzle-orm";

const RETENTION_DAYS = 14;

export async function runFileCleanup(): Promise<{ deleted: number; errors: number }> {
  console.log("[FileCleanup] Starting cleanup of files older than 14 days...");

  let deleted = 0;
  let errors = 0;

  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) {
      console.warn("[FileCleanup] DB unavailable, skipping cleanup");
      return { deleted: 0, errors: 0 };
    }

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    // Fetch all files older than the cutoff
    const oldFiles = await dbInstance
      .select()
      .from(projectFiles)
      .where(lt(projectFiles.createdAt, cutoff));

    console.log(`[FileCleanup] Found ${oldFiles.length} file(s) to delete`);

    for (const file of oldFiles) {
      try {
        // Delete from S3
        if (file.fileKey) {
          await storageDelete(file.fileKey);
        }

        // Delete from database
        const { eq } = await import("drizzle-orm");
        await dbInstance.delete(projectFiles).where(eq(projectFiles.id, file.id));

        deleted++;
        console.log(`[FileCleanup] Deleted file ${file.id}: ${file.fileName}`);
      } catch (err) {
        errors++;
        console.error(`[FileCleanup] Failed to delete file ${file.id}:`, err);
      }
    }

    console.log(`[FileCleanup] Done — deleted: ${deleted}, errors: ${errors}`);
  } catch (err) {
    console.error("[FileCleanup] Unexpected error:", err);
    errors++;
  }

  return { deleted, errors };
}

export function startFileCleanupScheduler() {
  // Run every day at 2:00 AM UTC
  cron.schedule("0 2 * * *", async () => {
    await runFileCleanup();
  });

  console.log("[FileCleanup] Scheduler started — runs daily at 02:00 UTC (files older than 14 days will be removed)");
}
