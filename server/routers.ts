import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { projects, inspectionReports } from "../drizzle/schema";
import { fetchAllProjects, validateCredentials, appendInspectionRequest, appendNewProjectInspectionRequest, fetchPastInspections, appendClientUpload, appendNewProjectEmail, updatePastInspectionReportLink } from "./googleSheets";
import { generateSingleInspectionPDF, getLicenseNumber } from "./reportGenerator";
import { schedulerState, runAutoReportGeneration } from "./reportScheduler";
import { storagePut } from "./storage";
import { createHash } from "crypto";
import { syncInspectionToGHL, syncContactToGHL, isGHLConfigured } from "./ghl";
import { SignJWT } from "jose";
import { ENV } from "./_core/env";

const JWT_SECRET = new TextEncoder().encode(ENV.cookieSecret);

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    
    logout: publicProcedure.mutation(async ({ ctx }) => {
      ctx.res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0');
      return { success: true };
    }),
    
    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const { email, password } = input;
        
        // First, check if user exists in database with password authentication
        let dbUser = await db.getUserByEmail(email, 'password');
        
        if (dbUser && dbUser.password === password) {
          // User found in database with matching password
          console.log('[DEBUG] User authenticated via database:', email);
          
          // Update last signed in
          const openId = dbUser.openId;
          await db.upsertUser({
            openId,
            email,
            name: dbUser.name || email.split('@')[0] || 'User',
            loginMethod: 'password',
            role: dbUser.role as 'admin' | 'user',
            company: dbUser.company || 'ALL',
            lastSignedIn: new Date(),
          });
          
          let user = await db.getUserByEmail(email);
          
          if (!user) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to retrieve user',
            });
          }
          
          // Create JWT token
          const token = await new SignJWT({ 
            openId: user.openId,
            appId: ENV.appId,
            name: user.name || user.email || 'User',
            company: user.company || 'ALL'
          })
            .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
            .setIssuedAt()
            .setExpirationTime('30d')
            .sign(JWT_SECRET);

          ctx.res.setHeader('Set-Cookie', `app_session_id=${token}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${30 * 24 * 60 * 60}`);
          
          return {
            appId: ENV.appId,
            name: user.name || user.email || 'User',
            company: user.company || 'ALL'
          } as const;
        }
        
        // Fallback: Validate credentials against Google Sheets
        const validation = await validateCredentials(email, password);
        
        if (!validation.valid) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Invalid email or password',
          });
        }
        
        // Create or update user in database
        const openId = `local-${email}`;
        await db.upsertUser({
          openId,
          email,
          name: email.split('@')[0] || 'User',
          loginMethod: 'local',
          role: validation.role as 'admin' | 'user',
          company: validation.company || 'ALL', // Store company assignment
          lastSignedIn: new Date(),
        });
        
        let user = await db.getUserByEmail(email);
        
        if (!user) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create user',
          });
        }
        
        // Create JWT token with all required fields
        const token = await new SignJWT({ 
          openId: user.openId,
          appId: ENV.appId,
          name: user.name || user.email || 'User',
          company: user.company || 'ALL'
        })
          .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
          .setIssuedAt()
          .setExpirationTime('30d')
          .sign(JWT_SECRET);

        ctx.res.setHeader('Set-Cookie', `app_session_id=${token}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${30 * 24 * 60 * 60}`);
        
        return {
          appId: ENV.appId,
          name: user.name || user.email || 'User',
          company: user.company || 'ALL'
        } as const;
      }),
  }),

  projects: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const dbInstance = await db.getDb();
      if (!dbInstance) return [];
      
      const userCompany = ctx.user.company;
      console.log('[DEBUG] projects.list - user company:', userCompany);
      
      // If user has "ALL" company access, return all projects
      if (userCompany === 'ALL') {
        const allProjects = await dbInstance.select().from(projects).orderBy(desc(projects.id));
        console.log('[DEBUG] projects.list - returning all projects for ALL access:', allProjects.length);
        return allProjects;
      }
      
      // Otherwise, filter by user's company (case-insensitive)
      if (!userCompany) {
        return []; // No projects if user has no company assigned
      }
      
      // Get all projects and filter by company (case-insensitive), sorted by newest first
      const allProjects = await dbInstance.select().from(projects).orderBy(desc(projects.id));
      const userProjects = allProjects.filter(p => {
        const matches = p.company?.toLowerCase() === userCompany.toLowerCase();
        return matches;
      });
      console.log('[DEBUG] projects.list - filtered projects for company', userCompany, ':', userProjects.length);
      return userProjects;
    }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const project = await db.getProjectById(input.id);
        
        if (!project) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Project not found',
          });
        }
        
        // Verify user has access to this project (admins, ALL company users, and null company users can see all)
        if (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && project.company?.toLowerCase() !== ctx.user.company?.toLowerCase()) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }
        
        return project;
      }),
    
    sync: protectedProcedure.mutation(async () => {
      try {
        console.log('[Sync] Starting Google Sheets sync...');
        
        // Fetch projects from Google Sheets FIRST (before deleting)
        const rows = await fetchAllProjects();
        console.log(`[Sync] Fetched ${rows.length} rows from Google Sheets`);
        if (rows.length > 0) {
          console.log('[Sync] First row sample:', JSON.stringify(rows[0], null, 2));
          console.log('[Sync] Available columns:', Object.keys(rows[0]).slice(0, 20).join(', '));
          console.log('[Sync] Total columns:', Object.keys(rows[0]).length);
          console.log('[Sync] Company column value:', rows[0]['company'] || rows[0]['COMPANY'] || 'NOT FOUND');
          console.log('[Sync] Opportunity ID column value:', rows[0]['Opportunity ID'] || rows[0]['opportunity id'] || rows[0]['Opportunity Id'] || 'NOT FOUND');
          // Log all column names that contain 'opp' or 'id'
          const oppColumns = Object.keys(rows[0]).filter(k => k.toLowerCase().includes('opp') || k.toLowerCase().includes('opportunity'));
          console.log('[Sync] Opportunity-related columns:', oppColumns);
        }
        
        // If fetch returns 0 rows, don't proceed with sync
        if (rows.length === 0) {
          console.log('[Sync] No rows fetched from Google Sheets, aborting sync');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'No data fetched from Google Sheets. Please check the sheet is accessible and has data.',
          });
        }
        
        // Clear existing projects only after successful fetch
        const database = await db.getDb();
        if (database) {
          const { projects: projectsTable } = await import('../drizzle/schema');
          await database.delete(projectsTable);
          console.log('[Sync] Cleared existing projects');
        }
        
        const db_instance = await db.getDb();
        if (!db_instance) {
          throw new Error('Database not available');
        }
        
        // Helper to safely get string value
        const getString = (value: string | undefined, maxLength?: number): string => {
          if (!value || value.trim() === '') return '';
          const trimmed = value.trim();
          return maxLength ? trimmed.substring(0, maxLength) : trimmed;
        };
        
        // Helper to parse date
        const parseDate = (value: string | undefined): Date | undefined => {
          if (!value || value.trim() === '') return undefined;
          const date = new Date(value.trim());
          return isNaN(date.getTime()) ? undefined : date;
        };
        
        // Process and insert projects
        const validProjects = rows
          .filter(row => {
            // Validate required fields (use lowercase for case-insensitive lookup)
            const opportunityName = getString(row['opportunity name'] || row['Opportunity Name']);
            const email = getString(row['email'] || row['Email']);
            
            // Check if opportunity name is valid (not garbled with commas, under 200 chars)
            if (!opportunityName || opportunityName.length > 200) return false;
            
            // Check if email is valid (contains @)
            if (!email || !email.includes('@')) return false;
            
            return true;
          })
          .map(row => ({
            opportunityName: getString(row['opportunity name'] || row['Opportunity Name'], 500),
            contactName: getString(row['contact name'] || row['Contact Name']),
            phone: getString(row['phone'] || row['Phone'], 100),
            email: getString(row['email'] || row['Email'], 320),
            pipeline: getString(row['pipeline'] || row['Pipeline']),
            stage: getString(row['stage'] || row['Stage']),
            leadValue: getString(row['lead value'] || row['Lead Value']),
            source: getString(row['source'] || row['Source']),
            assigned: getString(row['assigned'] || row['Assigned']),
            createdOn: getString(row['created on'] || row['Created on']),
            updatedOn: getString(row['updated on'] || row['Updated on']),
            lostReasonId: getString(row['lost reason id'] || row['Lost Reason ID']),
            lostReasonName: getString(row['lost reason'] || row['Lost Reason']),
            followers: getString(row['followers'] || row['Followers']),
            notes: getString(row['notes'] || row['Notes']),
            tag: getString(row['tag'] || row['Tag'] || row['tags']),
            address: getString(row['__col_13'] || row['address'] || row['Address']), // Column N - Address
            subdivision: getString(row['__col_31'] || row['subdivision'] || row['Subdivision']), // Column AF - Subdivision
            lotNumber: getString(row['__col_32'] || row['lot number'] || row['Lot Number']), // Column AG - Lot #
            permitNumber: getString(row['__col_34'] || row['permit number'] || row['Permit Number']), // Column AI - Permit #
            assignedPermitTech: getString(row['assign permit tech'] || row['Assign Permit tech']),
            assignedPlansExaminer: getString(row['assign plans examiner'] || row['Assign Plans Examiner']),
            assignedInspector: getString(row['assign inspector'] || row['Assign Inspector']),
            planningChecklist: getString(row['planning checklist'] || row['Planning Checklist']),
            permittingChecklist: getString(row['permitting information'] || row['PERMITTING INFORMATION']),
            inspectionChecklist: getString(row['inspection checklist'] || row['Inspection Checklist']),
            completedInspections: getString(row['completed inspections'] || row['COMPLETED INSPECTIONS'] || row['Completed Inspections']), // Column H
            inspection1Result: getString(row['1st inspection results'] || row['1st Inspection Results']),
            inspection2Result: getString(row['2nd inspection results'] || row['2nd Inspection Results']),
            inspection3Result: getString(row['3rd inspection results'] || row['3rd Inspection Results']),
            inspection1Type: getString(row['inspection type 1'] || row['Inspection Type 1']), // Column U
            inspection2Type: getString(row['inspection type 2'] || row['Inspection Type 2']), // Column V
            inspection3Type: getString(row['inspection type 3'] || row['Inspection Type 3']), // Column X
            inspection4Type: getString(row['inspection type 4'] || row['Inspection Type 4']), // Column Z
            inspection5Type: getString(row['inspection type 5'] || row['Inspection Type 5']), // Column AA
            proposalSent: getString(row['proposals sent'] || row['Proposals Sent']),
            proposalSigned: getString(row['proposal signed'] || row['Proposal Signed']),
            company: getString(row['company'] || row['COMPANY']), // Column BB - company assignment for filtering
            completionStatus: getString(row['__col_5'] || row['stage'] || row['Stage']), // Column F - Stage (Completed/Active status)
            // Extract by column position: AQ is column 42, AR is column 43
            opportunityId: getString(row['__col_42'] || row['opportunity id'] || row['Opportunity ID'] || row['Opportunity Id'] || row['opp id'] || row['Opp ID'], 100), // Column AQ - Opportunity ID
            contactId: getString(row['__col_43'] || row['contact id'] || row['Contact ID'] || row['Contact Id'] || row['contact_id'], 100), // Column AR - Contact ID
            completionDate: getString(row['completion date'] || row['Completion Date'] || row['COMPLETION DATE']), // Column AP - Completion Date
            lastUpdated: parseDate(row['Updated on']),
            syncedAt: new Date(),
          }));
        
        console.log(`[Sync] Inserting ${validProjects.length} valid projects`);
        
        // Debug: log all projects' opportunityId and contactId
        validProjects.forEach(p => {
          console.log(`[Sync DEBUG] ${p.opportunityName}: oppId=${JSON.stringify(p.opportunityId)}, contactId=${JSON.stringify(p.contactId)}, completedInspections=${JSON.stringify(p.completedInspections?.substring(0, 80))}`);
        });
        
        if (validProjects.length > 0) {
          await db_instance.insert(projects).values(validProjects);
        }
        
        console.log('[Sync] Sync completed successfully');
        return { count: validProjects.length };
      } catch (error) {
        console.error('[Sync] Error during sync:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Sync failed',
        });
      }
    }),
  }),

  pastInspections: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        const userCompany = ctx.user.company;
        
        // Fetch completed projects from Active Projects sheet (Stage = Complete)
        const database = await db.getDb();
        let completedProjects: any[] = [];
        if (database) {
          const allProjects = await database.select().from(projects);
          completedProjects = allProjects
            .filter(p => p.stage?.toLowerCase() === 'complete')
            .filter(p => {
              if (userCompany === 'ALL') return true;
              if (!userCompany || !p.company) return false;
              return p.company.toLowerCase() === userCompany.toLowerCase();
            })
            .map((p, index) => ({
              id: `active-${p.id}`,
              projectName: p.opportunityName || '',
              inspectionType: 'Completed Project',
              approvedStatus: 'Complete',
              dateApproved: '',
              company: p.company || '',
              source: 'active',
            }));
        }
        
        // Fetch past inspections from Past Inspections sheet
        const rows = await fetchPastInspections();
        // First, map ALL rows with their original sheet index before filtering
        const allMappedRows = rows.map((row, originalIndex) => ({
          row,
          originalIndex, // This is the 0-based index in the CSV data (row 0 = first data row = sheet row 2)
        }));
        const pastInspections = allMappedRows
          .filter(({ row }) => {
            const projectName = row['opportunity name'] || row['Opportunity Name'] || row['project name'] || row['Project Name'];
            if (!projectName || projectName.toLowerCase() === 'project name' || projectName.toLowerCase() === 'opportunity name') return false;
            const company = row['company'] || row['COMPANY'];
            if (userCompany === 'ALL') return true;
            if (!userCompany || !company) return false;
            return company.toLowerCase() === userCompany.toLowerCase();
          })
          .map(({ row, originalIndex }, filteredIndex) => ({
            id: `past-${filteredIndex}`,
            projectName: row['opportunity name'] || row['Opportunity Name'] || row['project name'] || row['Project Name'] || '',
            inspectionType: row['inspection type'] || row['Inspection Type'] || row['__col_7'] || '',
            approvedStatus: row['approved/ denied'] || row['Approved/ Denied'] || row['approved status'] || row['Approved Status'] || row['__col_8'] || '',
            dateApproved: row['approved date'] || row['Approved Date'] || row['date approved'] || row['Date Approved'] || row['__col_9'] || '',
            company: row['company'] || row['COMPANY'] || row['__col_4'] || '',
            inspectorName: row['inspector name:'] || row['Inspector Name:'] || row['__col_11'] || '',
            opportunityId: row['opportunity id'] || row['Opportunity ID'] || row['__col_5'] || '',
            reportLink: row['report link'] || row['Report Link'] || row['__col_12'] || '',
            source: 'past',
            sheetRowIndex: originalIndex, // Use original sheet row index, not filtered index
          }));
        
        // Combine both sources
        const combined = [...completedProjects, ...pastInspections];
        console.log(`[Completed Projects] Found ${completedProjects.length} completed projects and ${pastInspections.length} past inspections`);
        
        return combined;
      } catch (error) {
        console.error('[Past Inspections] Error fetching completed projects:', error);
        return [];
      }
    }),

    generateReport: protectedProcedure
      .input(z.object({
        projectName: z.string(),
        inspectionType: z.string(),
        approvedStatus: z.string(),
        dateApproved: z.string(),
        company: z.string(),
        inspectorName: z.string(),
        opportunityId: z.string(),
        sheetRowIndex: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Admin only
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }

        try {
          // Look up project from database to get permit number, address, and assigned inspector
          let permitNumber = '';
          let address = input.projectName;
          let assignedInspector = input.inspectorName; // fallback to past inspections inspector
          const database = await db.getDb();
          if (database && input.opportunityId) {
            const allProjects = await database.select().from(projects);
            const matchedProject = allProjects.find(
              p => p.opportunityId === input.opportunityId
            );
            if (matchedProject) {
              permitNumber = matchedProject.permitNumber || '';
              address = matchedProject.address || matchedProject.opportunityName || input.projectName;
              // Use assigned inspector from main All Sheet (column AN) if available
              if (matchedProject.assignedInspector && matchedProject.assignedInspector.trim()) {
                assignedInspector = matchedProject.assignedInspector.trim();
              }
            }
          }
          console.log(`[Report] Using inspector for PDF: "${assignedInspector}" (input was: "${input.inspectorName}")`);
          const licenseNumber = getLicenseNumber(assignedInspector, input.inspectionType);
          console.log(`[Report] License number: "${licenseNumber}" for inspector "${assignedInspector}" + type "${input.inspectionType}"`);

          // Generate PDF
          const pdfBuffer = await generateSingleInspectionPDF({
            permitNumber,
            address,
            projectName: input.projectName,
            inspectionType: input.inspectionType,
            dateApproved: input.dateApproved,
            approvedStatus: input.approvedStatus,
            inspectorName: assignedInspector,
            company: input.company,
            licenseNumber,
          });

          // Upload to S3
          const safeName = (input.projectName || 'inspection')
            .replace(/[^a-zA-Z0-9\s-]/g, '')
            .replace(/\s+/g, '-');
          const safeType = (input.inspectionType || 'report')
            .replace(/[^a-zA-Z0-9\s-]/g, '')
            .replace(/\s+/g, '-');
          const timestamp = Date.now();
          const fileKey = `inspection-reports/${safeName}-${safeType}-${timestamp}.pdf`;

          const { url } = await storagePut(fileKey, pdfBuffer, 'application/pdf');

          // Write report link back to Google Sheet column M
          await updatePastInspectionReportLink(
            input.sheetRowIndex,
            url,
            input.projectName,
            input.inspectionType
          ).catch(err => {
            console.error('[Report Link] Failed to update Google Sheet:', err);
          });

          // Save report link to database
          const database2 = await db.getDb();
          if (database2) {
            await database2.insert(inspectionReports).values({
              projectName: input.projectName,
              inspectionType: input.inspectionType,
              approvedStatus: input.approvedStatus,
              dateApproved: input.dateApproved,
              inspectorName: input.inspectorName,
              company: input.company,
              opportunityId: input.opportunityId,
              reportUrl: url,
              fileKey: fileKey,
              sheetRowIndex: input.sheetRowIndex,
            });
          }

          console.log(`[Report] Generated individual report for ${input.projectName} - ${input.inspectionType}: ${url}`);

          return { success: true, reportUrl: url };
        } catch (error) {
          console.error('[Report] Error generating individual inspection report:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to generate inspection report',
          });
        }
      }),

    generateAllReports: protectedProcedure
      .input(z.object({ forceRegenerate: z.boolean().optional() }).optional())
      .mutation(async ({ input, ctx }) => {
        // Admin only
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }

        const forceRegenerate = input?.forceRegenerate || false;

        try {
          // Fetch all past inspections
          const rows = await fetchPastInspections();
          const database = await db.getDb();
          let allDbProjects: any[] = [];
          if (database) {
            allDbProjects = await database.select().from(projects);
          }

          let generated = 0;
          let skipped = 0;

          for (let index = 0; index < rows.length; index++) {
            const row = rows[index]!;
            const projectName = row['opportunity name'] || row['Opportunity Name'] || row['project name'] || row['Project Name'] || '';
            if (!projectName || projectName.toLowerCase() === 'project name' || projectName.toLowerCase() === 'opportunity name') {
              skipped++;
              continue;
            }

            // Skip if report link already exists (unless force regenerating)
            if (!forceRegenerate) {
              const existingLink = row['report link'] || row['Report Link'] || row['__col_12'] || '';
              if (existingLink && existingLink.trim() !== '') {
                skipped++;
                continue;
              }
            }

            const inspectionType = row['inspection type'] || row['Inspection Type'] || row['__col_8'] || '';
            const approvedStatus = row['approved/ denied'] || row['Approved/ Denied'] || row['__col_9'] || '';
            const dateApproved = row['approved date'] || row['Approved Date'] || row['__col_10'] || '';
            const company = row['company'] || row['COMPANY'] || row['__col_5'] || '';
            const inspectorName = row['inspector name:'] || row['Inspector Name:'] || row['__col_12'] || '';
            const opportunityId = row['opportunity id'] || row['Opportunity ID'] || row['__col_6'] || '';

            // Look up permit number, address, and assigned inspector from database
            let permitNumber = '';
            let address = projectName;
            let assignedInspector = inspectorName; // fallback to past inspections inspector
            if (opportunityId) {
              const matchedProject = allDbProjects.find(p => p.opportunityId === opportunityId);
              if (matchedProject) {
                permitNumber = matchedProject.permitNumber || '';
                address = matchedProject.address || matchedProject.opportunityName || projectName;
                // Use assigned inspector from main All Sheet (column AN) if available
                if (matchedProject.assignedInspector && matchedProject.assignedInspector.trim()) {
                  assignedInspector = matchedProject.assignedInspector.trim();
                }
              }
            }
            console.log(`[Report All] Using inspector for PDF: "${assignedInspector}" (sheet had: "${inspectorName}") | oppId: "${opportunityId}"`);
            const licenseNumber = getLicenseNumber(assignedInspector, inspectionType);

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
            const safeName = (projectName || 'inspection')
              .replace(/[^a-zA-Z0-9\s-]/g, '')
              .replace(/\s+/g, '-');
            const safeType = (inspectionType || 'report')
              .replace(/[^a-zA-Z0-9\s-]/g, '')
              .replace(/\s+/g, '-');
            const timestamp = Date.now();
            const fileKey = `inspection-reports/${safeName}-${safeType}-${timestamp}.pdf`;

            const { url } = await storagePut(fileKey, pdfBuffer, 'application/pdf');

            // Save report link to database (delete old record first if force regenerating)
            if (database) {
              if (forceRegenerate) {
                // Delete any existing report for this project+inspection combo
                const existing = await database.select().from(inspectionReports);
                const match = existing.find(r => 
                  r.projectName === projectName && 
                  r.inspectionType === inspectionType &&
                  r.sheetRowIndex === index
                );
                if (match) {
                  await database.delete(inspectionReports).where(eq(inspectionReports.id, match.id));
                }
              }
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

            // Write report link back to Google Sheet column M
            await updatePastInspectionReportLink(
              index,
              url,
              projectName,
              inspectionType
            ).catch(err => {
              console.error(`[Report Link] Failed to update row ${index + 2}:`, err);
            });

            generated++;
          }

          console.log(`[Report] Bulk generation complete: ${generated} generated, ${skipped} skipped`);
          return { success: true, generated, skipped };
        } catch (error) {
          console.error('[Report] Error in bulk report generation:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to generate reports',
          });
        }
      }),
    // Sync existing report links from DB to Google Sheets column M
    // This re-writes all report links to the correct rows based on matching project name + inspection type
    syncReportLinksToSheet: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }

        try {
          const database = await db.getDb();
          if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

          // Get all reports from DB
          const dbReports = await database.select().from(inspectionReports);
          if (dbReports.length === 0) return { success: true, synced: 0, message: 'No reports in database' };

          // Fetch current sheet data to find correct row indices
          const rows = await fetchPastInspections();
          let synced = 0;

          for (const report of dbReports) {
            // Find the matching row in the sheet by project name + inspection type
            const matchIndex = rows.findIndex(row => {
              const sheetProject = (row['opportunity name'] || row['Opportunity Name'] || row['project name'] || row['Project Name'] || '').trim();
              const sheetType = (row['inspection type'] || row['Inspection Type'] || row['__col_7'] || '').trim();
              return sheetProject === report.projectName?.trim() && sheetType === report.inspectionType?.trim();
            });

            if (matchIndex >= 0 && report.reportUrl) {
              // Check if sheet already has a link for this row
              const existingLink = rows[matchIndex]?.['report link'] || rows[matchIndex]?.['Report Link'] || rows[matchIndex]?.['__col_12'] || '';
              if (existingLink && existingLink.trim() !== '') {
                console.log(`[Sync] Row ${matchIndex + 2} already has link, skipping: ${report.projectName} - ${report.inspectionType}`);
                continue;
              }

              console.log(`[Sync] Writing report link to sheet row ${matchIndex + 2} for: ${report.projectName} - ${report.inspectionType}`);
              const success = await updatePastInspectionReportLink(
                matchIndex,
                report.reportUrl,
                report.projectName || '',
                report.inspectionType || ''
              );

              if (success) {
                // Update the DB record with the correct sheetRowIndex
                await database.update(inspectionReports)
                  .set({ sheetRowIndex: matchIndex })
                  .where(eq(inspectionReports.id, report.id));
                synced++;
              }

              // Small delay between webhook calls to avoid rate limiting
              await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
              console.log(`[Sync] No matching sheet row found for: ${report.projectName} - ${report.inspectionType}`);
            }
          }

          console.log(`[Sync] Completed: ${synced} report links synced to Google Sheets`);
          return { success: true, synced };
        } catch (error) {
          console.error('[Sync] Error syncing report links:', error);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to sync report links' });
        }
      }),

    getReportLinks: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const database = await db.getDb();
        if (!database) return [];
        const reports = await database.select().from(inspectionReports).orderBy(desc(inspectionReports.createdAt));
        return reports;
      }),

    schedulerStatus: protectedProcedure
      .query(({ ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        return {
          isRunning: schedulerState.isRunning,
          lastRunAt: schedulerState.lastRunAt,
          lastRunResult: schedulerState.lastRunResult,
          nextRunAt: schedulerState.nextRunAt,
          schedule: 'Every hour, 7am–5pm CST, Mon–Fri',
        };
      }),

    runSchedulerNow: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        if (schedulerState.isRunning) {
          return { success: false, message: 'Scheduler is already running' };
        }
        // Run in background, don't await
        runAutoReportGeneration().catch(err => console.error('[AutoReport] Manual trigger error:', err));
        return { success: true, message: 'Scheduler triggered manually' };
      }),
  }),

  inspections: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        // Verify user has access to this project (admins and ALL company users can see all)
        const project = await db.getProjectById(input.projectId);
        if (!project || (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && project.company?.toLowerCase() !== ctx.user.company?.toLowerCase())) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }
        
        return await db.getInspectionsByProjectId(input.projectId);
      }),
    
    create: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        inspectionType: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verify user has access to this project (admins and ALL company users can see all)
        const project = await db.getProjectById(input.projectId);
        if (!project || (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && project.company?.toLowerCase() !== ctx.user.company?.toLowerCase())) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }
        
        // Get Contact ID from project data (will be synced from ALL sheet)
        const contactId = project.contactId || '';
        
        await db.createInspection({
          ...input,
          opportunityId: project.opportunityId || '',
          contactId: contactId,
          createdBy: ctx.user.email || '',
          status: 'scheduled',
          ghlSynced: 0,
        }, project);
        
        // Log inspection to Google Sheets
        const scheduledDateTime = new Date().toISOString();
        const inspectorName = ctx.user.name || 'Unassigned';
        await appendInspectionRequest(
          project.opportunityName || '',
          ctx.user.email || '',
          input.inspectionType,
          scheduledDateTime,
          inspectorName,
          'Scheduled',
          project.opportunityId || '',
          input.notes || '',
          project.address || '',
          contactId
        ).catch(err => console.error('[Google Sheets] Failed to log inspection:', err));
        
        // Sync to GHL if configured
        if (isGHLConfigured()) {
          syncInspectionToGHL({
            projectId: input.projectId,
            projectName: project.opportunityName || '',
            projectAddress: project.address || '',
            inspectionType: input.inspectionType,
            notes: input.notes,
          }).catch(err => console.error('[GHL] Sync failed:', err));
        }       
        return { success: true };
      }),
  }),

  // New project inspection request (for projects not yet in the system)
  newProjectInspection: router({
    create: protectedProcedure
      .input(z.object({
        projectName: z.string(),
        projectAddress: z.string(),
        inspectionType: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Log to New Project Inspection Requests sheet (separate sheet for new projects)
        const scheduledDateTime = new Date().toISOString();
        const inspectorName = ctx.user.name || 'Unassigned';
        
        await appendNewProjectInspectionRequest(
          input.projectName,
          ctx.user.email || '',
          input.inspectionType,
          scheduledDateTime,
          inspectorName,
          'Scheduled',
          input.notes || '',
          input.projectAddress
        ).catch(err => console.error('[Google Sheets] Failed to log new project inspection:', err));
        
        return { success: true };
      }),
  }),

  contacts: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        // Verify user has access to this project (admins and ALL company users can see all)
        const project = await db.getProjectById(input.projectId);
        if (!project || (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && project.company?.toLowerCase() !== ctx.user.company?.toLowerCase())) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }
        
        return await db.getContactEmailsByProjectId(input.projectId);
      }),
    
    create: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        email: z.string().email(),
        name: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verify user has access to this project (admins and ALL company users can see all)
        const project = await db.getProjectById(input.projectId);
        if (!project || (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && project.company?.toLowerCase() !== ctx.user.company?.toLowerCase())) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }
        
        await db.createContactEmail({
          projectId: input.projectId,
          email: input.email,
          name: input.name,
          ghlSynced: 0,
        });
        
        // Log to Google Sheets Additional Contact Emails tab
        const projectName = project.opportunityName || 'Unknown Project';
        const company = project.company || 'Unknown';
        const contactName = input.name || '';
        await appendNewProjectEmail(input.email, projectName, company, contactName)
          .catch(err => console.error('[Google Sheets] Failed to log additional contact email:', err));
        
        // Sync to GHL if configured
        if (isGHLConfigured()) {
          syncContactToGHL({
            projectId: input.projectId,
            opportunityName: project.opportunityName || '',
            email: input.email,
            name: input.name,
          }).catch(err => console.error('[GHL] Sync failed:', err));
        }
        
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        contactId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verify user has access to this project (admins and ALL company users can see all)
        const project = await db.getProjectById(input.projectId);
        if (!project || (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && project.company?.toLowerCase() !== ctx.user.company?.toLowerCase())) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }
        
        await db.deleteContactEmail(input.contactId);
        return { success: true };
      }),
  }),

  files: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && project.company?.toLowerCase() !== ctx.user.company?.toLowerCase())) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }
        
        return await db.getProjectFiles(input.projectId);
      }),
    
    upload: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        fileName: z.string(),
        fileUrl: z.string(),
        fileKey: z.string(),
        fileSize: z.number().optional(),
        mimeType: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && project.company?.toLowerCase() !== ctx.user.company?.toLowerCase())) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }
        
        await db.createProjectFile({
          ...input,
          uploadedBy: ctx.user.email || undefined,
        });
        
        // Log upload to Google Sheets with file data for Drive upload
        const company = project.company || 'Unknown';
        const projectName = project.opportunityName || 'Unknown Project';
        const email = ctx.user.email || 'Unknown';
        const opportunityId = project.opportunityId || '';
        const contactId = project.contactId || '';
        
        // Log to Google Sheets with S3 link (Zapier will handle Drive upload)
        await appendClientUpload(
          company,
          projectName,
          email,
          input.fileName,
          input.fileUrl, // S3 URL
          opportunityId,
          contactId
        ).catch(err => console.error('[Google Sheets] Failed to log client upload:', err));
        
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        fileId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && project.company?.toLowerCase() !== ctx.user.company?.toLowerCase())) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }
        
        await db.deleteProjectFile(input.fileId);
        return { success: true };
      }),
  }),

  // User dashboard with basic summary
  dashboard: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      const dbInstance = await db.getDb();
      if (!dbInstance) {
        return {
          totalProjects: 0,
          activeProjects: 0,
          completedProjects: 0,
          projectsByStage: {},
          recentFiles: [],
          upcomingInspections: [],
        };
      }

      const { inspections, projectFiles } = await import('../drizzle/schema');

      // Get user's projects (or all projects if admin/ALL company)
      let userProjects = await dbInstance.select().from(projects);
      if (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company) {
        userProjects = userProjects.filter(p => 
          p.company?.toLowerCase() === ctx.user.company?.toLowerCase()
        );
      }

      // Count active vs completed
      const activeProjects = userProjects.filter(p => 
        !p.completionStatus || p.completionStatus.toLowerCase() !== 'completed'
      ).length;
      const completedProjects = userProjects.filter(p => 
        p.completionStatus && p.completionStatus.toLowerCase() === 'completed'
      ).length;

      // Projects by stage
      const projectsByStage: Record<string, number> = {};
      userProjects.forEach(p => {
        const stage = p.stage || 'Unknown';
        projectsByStage[stage] = (projectsByStage[stage] || 0) + 1;
      });

      // Get recent files
      const allFiles = await dbInstance.select().from(projectFiles);
      const userProjectIds = new Set(userProjects.map(p => p.id));
      const recentFiles = allFiles
        .filter(f => userProjectIds.has(f.projectId))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);

      // Get upcoming inspections
      const allInspections = await dbInstance.select().from(inspections);
      const upcomingInspections = allInspections
        .filter(i => userProjectIds.has(i.projectId))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10);

      return {
        totalProjects: userProjects.length,
        activeProjects,
        completedProjects,
        projectsByStage,
        recentFiles,
        upcomingInspections,
      };
    }),
  }),

  // Admin-only dashboard with advanced analytics
  adminDashboard: router({
    analytics: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        // Check if user has ALL company access
        if (ctx.user?.company !== 'ALL') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Admin access required',
          });
        }

        const db_instance = await db.getDb();
        if (!db_instance) throw new Error("Database not available");

        const { eq, gte, lte, and, sql } = await import("drizzle-orm");
        const { inspections, projectFiles } = await import("../drizzle/schema");

        // Parse date range
        const now = new Date();
        const startDate = input?.startDate ? new Date(input.startDate) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        const endDate = input?.endDate ? new Date(input.endDate) : now;

        // Get all projects
        const allProjects = await db_instance.select().from(projects);

        // Inspector workload - count projects per assigned inspector
        const inspectorWorkload: Record<string, number> = {};
        allProjects.forEach(p => {
          const inspector = p.assignedInspector || 'Unassigned';
          inspectorWorkload[inspector] = (inspectorWorkload[inspector] || 0) + 1;
        });

        // Permit tech workload
        const permitTechWorkload: Record<string, number> = {};
        allProjects.forEach(p => {
          const tech = p.assignedPermitTech || 'Unassigned';
          permitTechWorkload[tech] = (permitTechWorkload[tech] || 0) + 1;
        });

        // Plans examiner workload
        const plansExaminerWorkload: Record<string, number> = {};
        allProjects.forEach(p => {
          const examiner = p.assignedPlansExaminer || 'Unassigned';
          plansExaminerWorkload[examiner] = (plansExaminerWorkload[examiner] || 0) + 1;
        });

        // Projects by stage
        const stageCount: Record<string, number> = {};
        allProjects.forEach(p => {
          const stage = p.stage || 'Unknown';
          stageCount[stage] = (stageCount[stage] || 0) + 1;
        });

        // Calculate completion percentage (projects in 'COMPLETE INSPECTION' or similar stages)
        const completedStages = ['COMPLETE INSPECTION', 'Completed', 'Complete', 'Done'];
        const completedProjectsList = allProjects.filter(p => 
          completedStages.some(s => p.stage?.toLowerCase().includes(s.toLowerCase()))
        );
        const completedProjects = completedProjectsList.length;
        const completionPercentage = allProjects.length > 0 
          ? Math.round((completedProjects / allProjects.length) * 100) 
          : 0;

        // Get inspections within date range
        const allInspections = await db_instance.select().from(inspections);
        const inspectionsInRange = allInspections.filter(i => {
          const createdAt = new Date(i.createdAt);
          return createdAt >= startDate && createdAt <= endDate;
        });

        // Inspections by status
        const inspectionsByStatus: Record<string, number> = {};
        inspectionsInRange.forEach(i => {
          const status = i.status || 'pending';
          inspectionsByStatus[status] = (inspectionsByStatus[status] || 0) + 1;
        });

        // Inspections by type
        const inspectionsByType: Record<string, number> = {};
        inspectionsInRange.forEach(i => {
          const type = i.inspectionType || 'Unknown';
          inspectionsByType[type] = (inspectionsByType[type] || 0) + 1;
        });

        // Weekly inspection trend (last 4 weeks)
        const weeklyTrend: { week: string; count: number }[] = [];
        for (let i = 3; i >= 0; i--) {
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - (i + 1) * 7);
          const weekEnd = new Date(now);
          weekEnd.setDate(now.getDate() - i * 7);
          
          const count = allInspections.filter(insp => {
            const createdAt = new Date(insp.createdAt);
            return createdAt >= weekStart && createdAt < weekEnd;
          }).length;
          
          weeklyTrend.push({
            week: `Week ${4 - i}`,
            count,
          });
        }

        // Count inspection results (Approved, Denied, Partial) from columns Z-AB
        // Helper function to parse result from text (may contain additional info)
        const parseResult = (text: string | null): 'approved' | 'denied' | 'partial' | null => {
          if (!text) return null;
          const lower = text.toLowerCase();
          if (lower.includes('approved')) return 'approved';
          if (lower.includes('denied')) return 'denied';
          if (lower.includes('partial')) return 'partial';
          return null;
        };

        // Tally results across all 3 inspection result columns
        const inspectionResultsTally = {
          approved: 0,
          denied: 0,
          partial: 0,
          total: 0,
        };

        allProjects.forEach(p => {
          // Check 1st inspection result
          const result1 = parseResult(p.inspection1Result);
          if (result1) {
            inspectionResultsTally[result1]++;
            inspectionResultsTally.total++;
          }
          
          // Check 2nd inspection result
          const result2 = parseResult(p.inspection2Result);
          if (result2) {
            inspectionResultsTally[result2]++;
            inspectionResultsTally.total++;
          }
          
          // Check 3rd inspection result
          const result3 = parseResult(p.inspection3Result);
          if (result3) {
            inspectionResultsTally[result3]++;
            inspectionResultsTally.total++;
          }
        });

        // Proposal tracking metrics
        const proposalProjects = allProjects.filter(p => 
          p.stage?.toLowerCase().includes('proposal')
        );
        
        const proposalsTally = {
          totalInProposalStage: proposalProjects.length,
          proposalsSent: allProjects.filter(p => 
            p.proposalSent?.toLowerCase() === 'yes'
          ).length,
          proposalsSigned: allProjects.filter(p => 
            p.proposalSigned?.toLowerCase() === 'yes'
          ).length,
          // Stuck = in Proposal stage AND (proposal sent but not signed, OR proposal not sent at all)
          stuck: proposalProjects.filter(p => {
            const sent = p.proposalSent?.toLowerCase() === 'yes';
            const signed = p.proposalSigned?.toLowerCase() === 'yes';
            // Stuck if: sent but not signed, OR not sent at all
            return (sent && !signed) || !sent;
          }).length,
        };

        return {
          totalProjects: allProjects.length,
          completedProjects,
          completionPercentage,
          projectsByStage: stageCount,
          inspectorWorkload,
          permitTechWorkload,
          plansExaminerWorkload,
          totalInspectionsInRange: inspectionsInRange.length,
          inspectionsByStatus,
          inspectionsByType,
          weeklyTrend,
          inspectionResultsTally,
          proposalsTally,
          completedProjectsList: completedProjectsList.map(p => ({
            id: p.id,
            opportunityName: p.opportunityName,
            address: p.address,
            permitNumber: p.permitNumber,
            stage: p.stage,
            assignedInspector: p.assignedInspector,
          })),
          dateRange: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          },
        };
      }),
  }),

  // Monthly Employee Report
  employeeReport: router({
    monthly: protectedProcedure
      .input(z.object({
        month: z.number().min(1).max(12),
        year: z.number().min(2020).max(2030),
        employee: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        // Admin only
        const user = ctx.user as any;
        if (user?.company !== 'ALL' && user?.role !== 'admin') {
          throw new Error('Unauthorized');
        }

        const db_instance = await (await import('./db')).getDb();
        if (!db_instance) throw new Error('Database not available');
        const allProjects: (typeof projects.$inferSelect)[] = await db_instance.select().from(projects);

        // Filter projects completed in the selected month/year
        const completedInMonth = allProjects.filter((p: typeof projects.$inferSelect) => {
          if (!p.completionDate) return false;
          // Try to parse the completion date
          const dateStr = p.completionDate.trim();
          const parsed = new Date(dateStr);
          if (isNaN(parsed.getTime())) {
            // Try MM/DD/YYYY format
            const parts = dateStr.split('/');
            if (parts.length === 3) {
              const m = parseInt(parts[0]);
              const y = parseInt(parts[2]);
              return m === input.month && y === input.year;
            }
            return false;
          }
          return (parsed.getMonth() + 1) === input.month && parsed.getFullYear() === input.year;
        });

        // Also include projects with stage = Complete/Closeout that have updatedOn in the month
        const completedByStage = allProjects.filter((p: typeof projects.$inferSelect) => {
          if (p.completionDate) return false; // Already captured above
          const stage = (p.stage || '').toLowerCase();
          if (!stage.includes('complete') && !stage.includes('closeout')) return false;
          const dateStr = (p.updatedOn || '').trim();
          if (!dateStr) return false;
          const parsed = new Date(dateStr);
          if (isNaN(parsed.getTime())) return false;
          return (parsed.getMonth() + 1) === input.month && parsed.getFullYear() === input.year;
        });

        const allCompleted = [...completedInMonth, ...completedByStage];

        // Build employee project map
        type EmployeeProject = {
          projectId: number;
          opportunityName: string;
          contactName: string | null;
          company: string | null;
          address: string | null;
          lotNumber: string | null;
          completionDate: string | null;
          type: string; // Permit, Inspection, Both
          assignedPermitTech: string | null;
          assignedPlansExaminer: string | null;
          assignedInspector: string | null;
          inspection1Type: string | null;
          inspection2Type: string | null;
          inspection3Type: string | null;
          inspection4Type: string | null;
          inspection5Type: string | null;
          inspection1Result: string | null;
          inspection2Result: string | null;
          inspection3Result: string | null;
          permitNumber: string | null;
          planningChecklist: string | null;
          permittingChecklist: string | null;
          inspectionChecklist: string | null;
          stage: string | null;
        };

        const employeeMap: Record<string, EmployeeProject[]> = {};

        allCompleted.forEach(p => {
          const employees = new Set<string>();
          const roles: Record<string, string[]> = {};

          // Trim empty strings to treat them as null
          const permitTech = (p.assignedPermitTech || '').trim() || null;
          const plansExaminer = (p.assignedPlansExaminer || '').trim() || null;
          const inspector = (p.assignedInspector || '').trim() || null;

          if (permitTech) {
            employees.add(permitTech);
            if (!roles[permitTech]) roles[permitTech] = [];
            roles[permitTech].push('Permit');
          }
          if (plansExaminer) {
            employees.add(plansExaminer);
            if (!roles[plansExaminer]) roles[plansExaminer] = [];
            roles[plansExaminer].push('Plans');
          }
          if (inspector) {
            employees.add(inspector);
            if (!roles[inspector]) roles[inspector] = [];
            roles[inspector].push('Inspection');
          }

          // If no employees assigned, put under "Unassigned"
          if (employees.size === 0) {
            employees.add('Unassigned');
            roles['Unassigned'] = ['Unassigned'];
          }

          const projectData: EmployeeProject = {
            projectId: p.id,
            opportunityName: p.opportunityName,
            contactName: p.contactName,
            company: p.company,
            address: p.address,
            lotNumber: p.lotNumber,
            completionDate: p.completionDate || p.updatedOn,
            type: 'Unknown',
            assignedPermitTech: p.assignedPermitTech,
            assignedPlansExaminer: p.assignedPlansExaminer,
            assignedInspector: p.assignedInspector,
            inspection1Type: p.inspection1Type,
            inspection2Type: p.inspection2Type,
            inspection3Type: p.inspection3Type,
            inspection4Type: p.inspection4Type,
            inspection5Type: p.inspection5Type,
            inspection1Result: p.inspection1Result,
            inspection2Result: p.inspection2Result,
            inspection3Result: p.inspection3Result,
            permitNumber: p.permitNumber,
            planningChecklist: p.planningChecklist,
            permittingChecklist: p.permittingChecklist,
            inspectionChecklist: p.inspectionChecklist,
            stage: p.stage,
          };

          employees.forEach(emp => {
            if (!employeeMap[emp]) employeeMap[emp] = [];
            const empRoles = roles[emp] || [];
            let type = empRoles.join(' & ');
            if (empRoles.includes('Permit') && empRoles.includes('Inspection')) type = 'Both';
            else if (emp === 'Unassigned') type = 'Unassigned';
            else if (empRoles.length === 0) type = 'Unknown';

            employeeMap[emp].push({ ...projectData, type });
          });
        });

        // Filter by employee if specified
        let result = Object.entries(employeeMap).map(([employee, projectsList]) => ({
          employee,
          projects: projectsList,
          totalProjects: projectsList.length,
        }));

        if (input.employee) {
          result = result.filter(r => r.employee.toLowerCase().includes(input.employee!.toLowerCase()));
        }

        // Sort by employee name
        result.sort((a, b) => a.employee.localeCompare(b.employee));

        // Get unique employee names for filter dropdown
        const allEmployees = new Set<string>();
        allProjects.forEach((p: typeof projects.$inferSelect) => {
          if (p.assignedPermitTech) allEmployees.add(p.assignedPermitTech);
          if (p.assignedPlansExaminer) allEmployees.add(p.assignedPlansExaminer);
          if (p.assignedInspector) allEmployees.add(p.assignedInspector);
        });

        return {
          employees: result,
          totalCompletedProjects: allCompleted.length,
          availableEmployees: Array.from(allEmployees).sort(),
          month: input.month,
          year: input.year,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
