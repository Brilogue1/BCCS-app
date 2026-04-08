/**
 * Automated Report Generation Scheduler
 *
 * Runs every hour from 7am to 5pm CST (UTC-6 standard / UTC-5 daylight).
 * Scans the Past Inspections sheet for rows missing a report link in column M,
 * generates PDFs, uploads to S3, and writes the link back to the sheet.
 *
 * CST is UTC-6 (standard) / CDT is UTC-5 (daylight saving).
 * 7am CST = 13:00 UTC (standard) or 12:00 UTC (DST)
 * 5pm CST = 23:00 UTC (standard) or 22:00 UTC (DST)
 *
 * We use UTC 13:00–23:00 to cover both CST and CDT safely.
 * Cron: "0 13-23 * * 1-5" = every hour at :00 from 13:00–23:00 UTC, Mon–Fri
 * (7am–5pm CST / 8am–6pm CDT — slightly generous on DST but always covers 7am-5pm CST)
 */

import cron from "node-cron";
import { fetchPastInspections, updatePastInspectionReportLink } from "./googleSheets";
import { generateSingleInspectionPDF, getLicenseNumber } from "./reportGenerator";
import { storagePut } from "./storage";
import * as db from "./db";
import { projects, inspectionReports } from "../drizzle/schema";

// Track scheduler state for admin visibility
export const schedulerState = {
  isRunning: false,
  lastRunAt: null as Date | null,
  lastRunResult: null as { generated: number; skipped: number; errors: number } | null,
  nextRunAt: null as Date | null,
};

/**
 * Core logic: scan Past Inspections sheet and generate reports for rows missing links.
 * This is the same logic as generateAllReports but runs automatically.
 */
export async function runAutoReportGeneration(): Promise<{ generated: number; skipped: number; errors: number }> {
  if (schedulerState.isRunning) {
    console.log("[AutoReport] Already running, skipping this tick");
    return { generated: 0, skipped: 0, errors: 0 };
  }

  schedulerState.isRunning = true;
  console.log("[AutoReport] Starting scheduled report generation scan...");

  let generated = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const rows = await fetchPastInspections();
    const database = await db.getDb();
    let allDbProjects: any[] = [];
    if (database) {
      allDbProjects = await database.select().from(projects);
    }

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]!;

      const projectName = row["opportunity name"] || row["Opportunity Name"] || row["project name"] || row["Project Name"] || "";
      if (!projectName || projectName.toLowerCase() === "project name" || projectName.toLowerCase() === "opportunity name") {
        skipped++;
        continue;
      }

      // Skip rows that already have a report link in column M
      const existingLink = row["report link"] || row["Report Link"] || row["__col_12"] || "";
      if (existingLink && existingLink.trim() !== "") {
        skipped++;
        continue;
      }

      const inspectionType = row["inspection type"] || row["Inspection Type"] || row["__col_8"] || "";

      // Skip rows with blank or placeholder inspection types (e.g. "_" or empty)
      const cleanType = inspectionType.trim().replace(/^_+$/, "").trim();
      if (!cleanType) {
        skipped++;
        continue;
      }

      const approvedStatus = row["approved/ denied"] || row["Approved/ Denied"] || row["__col_9"] || "";
      const dateApproved = row["approved date"] || row["Approved Date"] || row["__col_10"] || "";
      const company = row["company"] || row["COMPANY"] || row["__col_5"] || "";
      const inspectorName = row["inspector name:"] || row["Inspector Name:"] || row["__col_12"] || "";
      const opportunityId = row["opportunity id"] || row["Opportunity ID"] || row["__col_6"] || "";

      // Look up permit number, address, and assigned inspector from database
      let permitNumber = "";
      let address = projectName;
      let assignedInspector = inspectorName;

      if (opportunityId) {
        const matchedProject = allDbProjects.find((p) => p.opportunityId === opportunityId);
        if (matchedProject) {
          permitNumber = matchedProject.permitNumber || "";
          address = matchedProject.address || matchedProject.opportunityName || projectName;
          if (matchedProject.assignedInspector && matchedProject.assignedInspector.trim()) {
            assignedInspector = matchedProject.assignedInspector.trim();
          }
        }
      }

      const licenseNumber = getLicenseNumber(assignedInspector, inspectionType);

      try {
        // Generate PDF
        const pdfBuffer = await generateSingleInspectionPDF({
          permitNumber,
          address,
          projectName,
          inspectionType,
          dateApproved,
          approvedStatus,
          inspectorName: assignedInspector,
          company,
          licenseNumber,
        });

        // Upload to S3
        const safeName = (projectName || "inspection")
          .replace(/[^a-zA-Z0-9\s-]/g, "")
          .replace(/\s+/g, "-");
        const safeType = (inspectionType || "report")
          .replace(/[^a-zA-Z0-9\s-]/g, "")
          .replace(/\s+/g, "-");
        const timestamp = Date.now();
        const fileKey = `inspection-reports/${safeName}-${safeType}-${timestamp}.pdf`;

        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

        // Save to database
        if (database) {
          await database.insert(inspectionReports).values({
            projectName,
            inspectionType,
            approvedStatus,
            dateApproved,
            inspectorName: assignedInspector,
            company,
            opportunityId,
            reportUrl: url,
            fileKey,
            sheetRowIndex: index,
          });
        }

        // Write link back to Google Sheet column M
        await updatePastInspectionReportLink(index, url, projectName, inspectionType).catch((err) => {
          console.error(`[AutoReport] Failed to update sheet row ${index + 2}:`, err);
        });

        console.log(`[AutoReport] Generated report for row ${index + 2}: ${projectName} - ${inspectionType}`);
        generated++;

        // Small delay between reports to avoid hammering S3/Sheets
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.error(`[AutoReport] Error generating report for row ${index + 2} (${projectName} - ${inspectionType}):`, err);
        errors++;
      }
    }
  } catch (err) {
    console.error("[AutoReport] Fatal error during scheduled run:", err);
    errors++;
  } finally {
    schedulerState.isRunning = false;
    schedulerState.lastRunAt = new Date();
    schedulerState.lastRunResult = { generated, skipped, errors };
    console.log(`[AutoReport] Scan complete: ${generated} generated, ${skipped} skipped, ${errors} errors`);
  }

  return { generated, skipped, errors };
}

/**
 * Start the cron scheduler.
 * Runs at the top of every hour, 7am–5pm CST (13:00–23:00 UTC), Monday–Friday.
 *
 * Cron expression: 0 13-23 * * 1-5
 *   - Second 0, minute 0 = top of the hour
 *   - Hours 13-23 UTC = 7am-5pm CST (8am-6pm CDT)
 *   - Mon-Fri only
 */
export function startReportScheduler() {
  // Cron: every hour at :00, from 13:00–23:00 UTC, Mon–Fri
  const cronExpression = "0 13-23 * * 1-5";

  const task = cron.schedule(cronExpression, async () => {
    const now = new Date();
    console.log(`[AutoReport] Cron triggered at ${now.toISOString()}`);
    await runAutoReportGeneration();
  });

  // Calculate next run time for display
  const updateNextRun = () => {
    const now = new Date();
    const next = new Date(now);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    schedulerState.nextRunAt = next;
  };
  updateNextRun();

  console.log(`[AutoReport] Scheduler started. Runs hourly 7am-5pm CST (Mon-Fri). Next run: ${schedulerState.nextRunAt?.toISOString()}`);
  return task;
}
