import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { desc, eq, sql, and, inArray } from "drizzle-orm";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { projects, inspectionReports, projectAccess, users, requiredInspections } from "../drizzle/schema";
import { fetchAllProjects, validateCredentials, appendInspectionRequest, appendNewProjectInspectionRequest, fetchPastInspections, appendClientUpload, appendNewProjectEmail, updatePastInspectionReportLink, fetchEmployeeNumbers, appendPlansUpload, appendReschedule } from "./googleSheets";
import { generateSingleInspectionPDF, getLicenseNumber } from "./reportGenerator";
import { schedulerState, runAutoReportGeneration } from "./reportScheduler";
import { storagePut } from "./storage";
import { createHash } from "crypto";
import { syncInspectionToGHL, syncContactToGHL, isGHLConfigured } from "./ghl";
import { SignJWT } from "jose";
import { ENV } from "./_core/env";
import { companiesMatch, normalizeInspectionType } from "../shared/utils";

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
      
      // Subcontractors only see explicitly assigned projects
      if (ctx.user.role === 'subcontractor') {
        const accessRows = await dbInstance.select().from(projectAccess).where(eq(projectAccess.userId, ctx.user.id));
        const projectIds = accessRows.map(r => r.projectId);
        if (projectIds.length === 0) return [];
        const assignedProjects = await dbInstance.select().from(projects).where(inArray(projects.id, projectIds)).orderBy(desc(projects.id));
        return assignedProjects;
      }

      // Admins see all projects
      if (ctx.user.role === 'admin') {
        const allProjects = await dbInstance.select().from(projects).orderBy(desc(projects.id));
        console.log('[DEBUG] projects.list - returning all projects for admin:', allProjects.length);
        return allProjects;
      }

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
        const matches = companiesMatch(p.company, userCompany);
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
        
        // Subcontractors: verify explicit project access
        if (ctx.user.role === 'subcontractor') {
          const dbInstance = await db.getDb();
          if (!dbInstance) throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
          const accessRows = await dbInstance.select().from(projectAccess)
            .where(and(eq(projectAccess.userId, ctx.user.id), eq(projectAccess.projectId, input.id)));
          if (accessRows.length === 0) throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this project' });
        } else if (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && !companiesMatch(project.company, ctx.user.company)) {
          // Verify user has access to this project (admins, ALL company users, and null company users can see all)
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }
        
        return project;
      }),
    
    getInspectorPhone: protectedProcedure
      .input(z.object({ inspectorName: z.string() }))
      .query(async ({ input }) => {
        if (!input.inspectorName) return null;
        const phoneMap = await fetchEmployeeNumbers();
        const phone = phoneMap[input.inspectorName.toLowerCase()];
        return phone || null;
      }),
    
    getByOpportunityId: protectedProcedure
      .input(z.object({ opportunityId: z.string() }))
      .query(async ({ input, ctx }) => {
        const project = await db.getProjectByOpportunityId(input.opportunityId);
        
        if (!project) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Project not found',
          });
        }
        
        // Verify user has access to this project
        if (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && !companiesMatch(project.company, ctx.user.company)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }
        
        return project;
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can delete projects' });
        }
        const dbInstance = await db.getDb();
        if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        // Delete related records first
        const { inspections: inspTable, contactEmails, projectFiles, projectAccess } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        await dbInstance.delete(inspTable).where(eq(inspTable.projectId, input.id));
        await dbInstance.delete(contactEmails).where(eq(contactEmails.projectId, input.id));
        await dbInstance.delete(projectFiles).where(eq(projectFiles.projectId, input.id));
        await dbInstance.delete(projectAccess).where(eq(projectAccess.projectId, input.id));
        await dbInstance.delete(projects).where(eq(projects.id, input.id));
        return { success: true };
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
            jurisdiction: getString(row['__col_35'] || row['jurisdiction'] || row['Jurisdiction']), // Column AJ - Jurisdiction
            lastUpdated: parseDate(row['Updated on']),
            syncedAt: new Date(),
          }));
        
        console.log(`[Sync] Inserting ${validProjects.length} valid projects`);
        
        // Debug: log all projects' opportunityId and contactId
        validProjects.forEach(p => {
          console.log(`[Sync DEBUG] ${p.opportunityName}: oppId=${JSON.stringify(p.opportunityId)}, contactId=${JSON.stringify(p.contactId)}, completedInspections=${JSON.stringify(p.completedInspections?.substring(0, 80))}`);
        });
        
        // Upsert by opportunityId to preserve stable project IDs across syncs
        // Projects with no opportunityId fall back to insert-only (no stable key to upsert on)
        const withOppId = validProjects.filter(p => p.opportunityId && p.opportunityId.trim() !== '');
        const withoutOppId = validProjects.filter(p => !p.opportunityId || p.opportunityId.trim() === '');
        console.log(`[Sync] withOppId: ${withOppId.length}, withoutOppId: ${withoutOppId.length}`);
        if (withOppId.length > 0) console.log('[Sync] Sample oppIds:', withOppId.slice(0, 3).map(p => p.opportunityId));
        if (withoutOppId.length > 0) console.log('[Sync] Projects without oppId:', withoutOppId.map(p => p.opportunityName?.substring(0, 30)));
        
        if (withOppId.length > 0) {
          // Upsert in batches of 50 to avoid query size limits
          for (let i = 0; i < withOppId.length; i += 50) {
            const batch = withOppId.slice(i, i + 50);
            await db_instance.insert(projects).values(batch).onDuplicateKeyUpdate({
              set: {
                opportunityName: sql`VALUES(opportunityName)`,
                contactName: sql`VALUES(contactName)`,
                phone: sql`VALUES(phone)`,
                email: sql`VALUES(email)`,
                pipeline: sql`VALUES(pipeline)`,
                stage: sql`VALUES(stage)`,
                leadValue: sql`VALUES(leadValue)`,
                source: sql`VALUES(source)`,
                assigned: sql`VALUES(assigned)`,
                address: sql`VALUES(address)`,
                subdivision: sql`VALUES(subdivision)`,
                lotNumber: sql`VALUES(lotNumber)`,
                permitNumber: sql`VALUES(permitNumber)`,
                assignedPermitTech: sql`VALUES(assignedPermitTech)`,
                assignedPlansExaminer: sql`VALUES(assignedPlansExaminer)`,
                assignedInspector: sql`VALUES(assignedInspector)`,
                planningChecklist: sql`VALUES(planningChecklist)`,
                permittingChecklist: sql`VALUES(permittingChecklist)`,
                inspectionChecklist: sql`VALUES(inspectionChecklist)`,
                completedInspections: sql`VALUES(completedInspections)`,
                inspection1Result: sql`VALUES(inspection1Result)`,
                inspection2Result: sql`VALUES(inspection2Result)`,
                inspection3Result: sql`VALUES(inspection3Result)`,
                inspection1Type: sql`VALUES(inspection1Type)`,
                inspection2Type: sql`VALUES(inspection2Type)`,
                inspection3Type: sql`VALUES(inspection3Type)`,
                inspection4Type: sql`VALUES(inspection4Type)`,
                inspection5Type: sql`VALUES(inspection5Type)`,
                proposalSent: sql`VALUES(proposalSent)`,
                proposalSigned: sql`VALUES(proposalSigned)`,
                company: sql`VALUES(company)`,
                completionStatus: sql`VALUES(completionStatus)`,
                contactId: sql`VALUES(contactId)`,
                completionDate: sql`VALUES(completionDate)`,
                jurisdiction: sql`VALUES(jurisdiction)`,
                lastUpdated: sql`VALUES(lastUpdated)`,
                syncedAt: sql`VALUES(syncedAt)`,
              }
            });
          }
        }
        
        // For projects without an opportunityId, deduplicate by opportunity name before inserting
        // to prevent duplicate rows being created on every sync
        if (withoutOppId.length > 0) {
          console.log(`[Sync] Processing ${withoutOppId.length} projects without opportunityId`);
          // Fetch existing projects that also have no opportunityId, keyed by name
          const existingNoOppId = await db_instance.select({ id: projects.id, opportunityName: projects.opportunityName })
            .from(projects)
            .where(sql`(opportunityId IS NULL OR opportunityId = '')`);
          const existingNameSet = new Set(existingNoOppId.map(p => (p.opportunityName || '').trim().toLowerCase()));
          const trulyNew = withoutOppId.filter(p => !existingNameSet.has((p.opportunityName || '').trim().toLowerCase()));
          if (trulyNew.length > 0) {
            console.log(`[Sync] Inserting ${trulyNew.length} truly new projects without opportunityId (${withoutOppId.length - trulyNew.length} skipped as duplicates)`);
            await db_instance.insert(projects).values(trulyNew);
          } else {
            console.log(`[Sync] All ${withoutOppId.length} projects without opportunityId already exist by name, skipping inserts`);
          }
        }
        
        // After upserting projects, auto-mark DB inspections as 'completed'
        // when their type appears in the project's column H (completedInspections text)
        // This keeps DB status in sync with what GHL has resolved
        try {
          const { inspections: inspTable } = await import('../drizzle/schema');
          // Get all scheduled/pending DB inspections
          const activeDbInspections = await db_instance.select().from(inspTable)
            .where(sql`status IN ('scheduled', 'pending')`);
          if (activeDbInspections.length > 0) {
            // Build a map of projectId -> completedInspections text from the synced projects
            const projectCompletedMap = new Map<number, string>();
            for (const p of validProjects) {
              // Find the DB project id by opportunityId
              if (p.opportunityId) {
                const dbProj = await db_instance.select({ id: projects.id, completedInspections: projects.completedInspections })
                  .from(projects).where(eq(projects.opportunityId, p.opportunityId)).limit(1);
                if (dbProj[0]) projectCompletedMap.set(dbProj[0].id, dbProj[0].completedInspections || '');
              }
            }
            let markedCompleted = 0;
            for (const insp of activeDbInspections) {
              const completedText = (projectCompletedMap.get(insp.projectId) || '').toUpperCase();
              if (!completedText) continue;
              const inspNorm = normalizeInspectionType(insp.inspectionType);
              // Parse completed types from column H
              const completedNorms = new Set<string>();
              if (completedText.includes('\u2014')) {
                for (const seg of completedText.split('|')) {
                  const idx = seg.indexOf('\u2014');
                  if (idx !== -1) completedNorms.add(normalizeInspectionType(seg.substring(idx + 1).trim()));
                }
              } else {
                const resultSuffixes = [' - APPROVED', ' - FAILED', ' - PARTIAL', ' - CANCELLED', ' - PENDING', ' - PASS', ' - FAIL'];
                for (const seg of completedText.split(',')) {
                  let t = seg.trim();
                  for (const s of resultSuffixes) { if (t.endsWith(s)) { t = t.slice(0, t.length - s.length).trim(); break; } }
                  if (t) completedNorms.add(normalizeInspectionType(t));
                }
              }
              if (completedNorms.has(inspNorm)) {
                await db_instance.update(inspTable).set({ status: 'completed' }).where(eq(inspTable.id, insp.id));
                markedCompleted++;
              }
            }
            if (markedCompleted > 0) console.log(`[Sync] Auto-marked ${markedCompleted} DB inspections as completed based on column H`);
          }
        } catch (syncStatusErr) {
          console.error('[Sync] Error auto-updating inspection statuses:', syncStatusErr);
          // Non-fatal: don't fail the whole sync
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
              return companiesMatch(p.company, userCompany);
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
            return companiesMatch(company, userCompany);
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

            // Skip rows with blank or placeholder inspection types
            const cleanType = inspectionType.trim().replace(/^_+$/, '').trim();
            if (!cleanType) {
              skipped++;
              continue;
            }

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

            // Save report link to database (upsert: update if exists, insert if new)
            if (database) {
              const existing = await database.select().from(inspectionReports);
              const match = existing.find(r =>
                r.projectName === projectName &&
                r.inspectionType === inspectionType &&
                r.sheetRowIndex === index
              );
              if (match) {
                // Update existing record in place
                await database.update(inspectionReports)
                  .set({
                    approvedStatus,
                    dateApproved,
                    inspectorName: assignedInspector,
                    company,
                    opportunityId,
                    reportUrl: url,
                    fileKey,
                  })
                  .where(eq(inspectionReports.id, match.id));
              } else {
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

    // Client-facing: returns inspection reports filtered by the logged-in user's company
    getMyReports: protectedProcedure
      .query(async ({ ctx }) => {
        const database = await db.getDb();
        if (!database) return [];
        const userCompany = ctx.user.company;
        const allReports = await database.select().from(inspectionReports).orderBy(desc(inspectionReports.createdAt));
        // Admins (company=ALL) see all reports; clients see only their company's reports
        const filtered = allReports.filter(r => {
          if (!r.reportUrl) return false; // Only show reports that have a PDF
          if (userCompany === 'ALL') return true;
          if (!userCompany || !r.company) return false;
          return companiesMatch(r.company, userCompany);
        });
        // Return safe fields only — no fileKey exposed to clients
        return filtered.map(r => ({
          id: r.id,
          projectName: r.projectName,
          inspectionType: r.inspectionType,
          approvedStatus: r.approvedStatus,
          dateApproved: r.dateApproved,
          company: r.company,
          inspectorName: r.inspectorName,
          reportUrl: r.reportUrl,
          createdAt: r.createdAt,
        }));
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

    // Returns the set of completed inspection types for a given opportunityId
    // by reading directly from the Past Inspections Google Sheet tab.
    getCompletedTypesByOpportunityId: protectedProcedure
      .input(z.object({ opportunityId: z.string() }))
      .query(async ({ input }) => {
        if (!input.opportunityId) return [];
        try {
          const rows = await fetchPastInspections();
          const types = rows
            .filter(row => {
              const oppId = row['opportunity id'] || row['Opportunity ID'] || row['__col_5'] || row['__col_6'] || '';
              return oppId.trim() === input.opportunityId.trim();
            })
            .map(row => normalizeInspectionType(row['inspection type'] || row['Inspection Type'] || row['__col_7'] || ''))
            .filter(t => t && t !== '_' && t.replace(/_/g, '').trim() !== '');
          return Array.from(new Set(types));
        } catch (err) {
          console.error('[getCompletedTypesByOpportunityId] Error:', err);
          return [];
        }
      }),

    // Returns a map of { opportunityId -> completedInspectionTypes[] } for all projects.
    // Used by the Projects list page to deduplicate Requested badges across all project cards in one call.
    getCompletedOpportunityTypeMap: protectedProcedure.query(async () => {
      try {
        const rows = await fetchPastInspections();
        const map: Record<string, string[]> = {};
        for (const row of rows) {
          const oppId = (row['opportunity id'] || row['Opportunity ID'] || row['__col_5'] || row['__col_6'] || '').trim();
          const type = normalizeInspectionType(row['inspection type'] || row['Inspection Type'] || row['__col_7'] || '');
          if (!oppId || !type || type === '_' || type.replace(/_/g, '').trim() === '') continue;
          if (!map[oppId]) map[oppId] = [];
          if (!map[oppId].includes(type)) map[oppId].push(type);
        }
        return map;
      } catch (err) {
        console.error('[getCompletedOpportunityTypeMap] Error:', err);
        return {};
      }
    }),

    // Returns full completed inspection rows for a given opportunityId from the Past Inspections sheet.
    // Used to display the Completed Inspections list on the project detail page.
    getCompletedByOpportunityId: protectedProcedure
      .input(z.object({ opportunityId: z.string() }))
      .query(async ({ input }) => {
        if (!input.opportunityId) return [];
        try {
          const rows = await fetchPastInspections();
          return rows
            .filter(row => {
              const oppId = row['opportunity id'] || row['Opportunity ID'] || row['__col_5'] || row['__col_6'] || '';
              return oppId.trim() === input.opportunityId.trim();
            })
            .map(row => ({
              inspectionType: (row['inspection type'] || row['Inspection Type'] || row['__col_7'] || '').trim(),
              result: (row['approved/ denied'] || row['Approved/ Denied'] || row['approved status'] || row['Approved Status'] || row['__col_8'] || '').trim(),
              dateApproved: (row['approved date'] || row['Approved Date'] || row['date approved'] || row['Date Approved'] || row['__col_9'] || '').trim(),
              reportLink: (row['report link'] || row['Report Link'] || row['__col_12'] || '').trim(),
            }))
            .filter(r => {
              const t = r.inspectionType.trim().toUpperCase();
              return t && t !== '_' && t !== ' _ ' && t.replace(/_/g, '').trim() !== '';
            });
        } catch (err) {
          console.error('[getCompletedByOpportunityId] Error:', err);
          return [];
        }
      }),
  }),

  inspections: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        // Verify user has access to this project (admins and ALL company users can see all)
        const project = await db.getProjectById(input.projectId);
        if (!project || (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && !companiesMatch(project.company, ctx.user.company))) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }
        
        return await db.getInspectionsByProjectId(input.projectId);
      }),
    
    listAllForUser: protectedProcedure.query(async ({ ctx }) => {
      const dbInstance = await db.getDb();
      if (!dbInstance) return [];
      const { inspections: inspTable } = await import('../drizzle/schema');
      const allProjects = await dbInstance.select().from(projects);
      let userProjects = allProjects;
      if (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company) {
        userProjects = allProjects.filter(p => companiesMatch(p.company, ctx.user.company));
      }
      const projectIdSet = new Set(userProjects.map(p => p.id));
      const allInspections = await dbInstance.select().from(inspTable);
      return allInspections.filter(i => projectIdSet.has(i.projectId));
    }),

    updateNotes: protectedProcedure
      .input(z.object({
        id: z.number(),
        notes: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const dbInstance = await db.getDb();
        if (!dbInstance) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        const { inspections: inspTable } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        // Verify the inspection exists and user has access
        const [existing] = await dbInstance.select().from(inspTable).where(eq(inspTable.id, input.id));
        if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Inspection not found' });
        const project = await db.getProjectById(existing.projectId);
        if (!project || (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && !companiesMatch(project.company, ctx.user.company))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this inspection' });
        }
        await dbInstance.update(inspTable).set({ notes: input.notes }).where(eq(inspTable.id, input.id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can delete inspections' });
        }
        await db.deleteInspection(input.id);
        return { success: true };
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
        if (!project || (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && !companiesMatch(project.company, ctx.user.company))) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }

        // Safeguard 1: Allow up to 3 inspections without a permit number, then block
        const permitNum = (project.permitNumber || '').trim();
        const missingPermit = !permitNum || permitNum.toUpperCase() === 'N/A' || permitNum === '-';
        const existingInspections = await db.getInspectionsByProjectId(input.projectId);
        if (missingPermit) {
          if (existingInspections.length >= 3) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'You have reached the 3-inspection limit for projects without a permit number on file. Please contact BCCS to update your permit number before scheduling additional inspections.',
            });
          }
        }

        // Safeguard 2: Max 5 SCHEDULED (not yet completed) inspections at a time
        // Build a set of completed inspection types from column H so we can exclude them
        // normalizeInspectionType is imported at the top of this file
        const completedText = (project.completedInspections || '').toUpperCase();
        const completedNormSet = new Set<string>();
        if (completedText) {
          if (completedText.includes('\u2014')) {
            // Pipe-separated: "DATE — TYPE | DATE — TYPE"
            for (const seg of completedText.split('|')) {
              const idx = seg.indexOf('\u2014');
              if (idx !== -1) completedNormSet.add(normalizeInspectionType(seg.substring(idx + 1).trim()));
            }
          } else {
            // Comma-separated: "TYPE - Result, TYPE2 - Result2"
            const resultSuffixes = [' - APPROVED', ' - FAILED', ' - PARTIAL', ' - CANCELLED', ' - PENDING', ' - PASS', ' - FAIL'];
            for (const seg of completedText.split(',')) {
              let t = seg.trim();
              for (const s of resultSuffixes) { if (t.endsWith(s)) { t = t.slice(0, t.length - s.length).trim(); break; } }
              if (t) completedNormSet.add(normalizeInspectionType(t));
            }
          }
        }
        // Also mark DB completed inspections
        for (const i of existingInspections) {
          if (i.status === 'completed' || i.status === 'cancelled') {
            completedNormSet.add(normalizeInspectionType(i.inspectionType));
          }
        }
        // Sheet columns U-AA: only count types NOT already in the completed set
        const sheetScheduledCount = [
          project.inspection1Type,
          project.inspection2Type,
          project.inspection3Type,
          project.inspection4Type,
          project.inspection5Type,
        ].filter(t => {
          if (!t || t.trim() === '' || t.trim() === '_') return false;
          return !completedNormSet.has(normalizeInspectionType(t));
        }).length;
        // DB inspections that are pending or scheduled (not completed/cancelled)
        const dbActiveCount = existingInspections.filter(i => i.status === 'pending' || i.status === 'scheduled').length;
        const totalActive = sheetScheduledCount + dbActiveCount;
        if (totalActive >= 5) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `This project already has ${totalActive} active scheduled inspection${totalActive !== 1 ? 's' : ''}. Once one is completed or resolved, you can schedule another.`,
          });
        }

        // Get Contact ID from project data (will be synced from ALL sheet)
        const contactId = project.contactId || '';
        
        // Use the project owner's email (column D of All Projects sheet) for GHL/logging,
        // not the logged-in user's email — GHL looks up contacts by project owner email.
        const ownerEmail = project.email || ctx.user.email || '';
        
        await db.createInspection({
          ...input,
          opportunityId: project.opportunityId || '',
          contactId: contactId,
          createdBy: ownerEmail,
          status: 'scheduled',
          ghlSynced: 0,
        }, project);
        
        // Log inspection to Google Sheets
        const scheduledDateTime = new Date().toISOString();
        const inspectorName = ctx.user.name || 'Unassigned';
        await appendInspectionRequest(
          project.opportunityName || '',
          ownerEmail,
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
        if (!project || (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && !companiesMatch(project.company, ctx.user.company))) {
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
        if (!project || (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && !companiesMatch(project.company, ctx.user.company))) {
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
        if (!project || (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && !companiesMatch(project.company, ctx.user.company))) {
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
        if (!project || (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && !companiesMatch(project.company, ctx.user.company))) {
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
        if (!project || (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && !companiesMatch(project.company, ctx.user.company))) {
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
        if (!project || (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && !companiesMatch(project.company, ctx.user.company))) {
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
          companiesMatch(p.company, ctx.user.company)
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

      // Get upcoming inspections (Requested DB entries) with project name attached
      const allInspections = await dbInstance.select().from(inspections);
      const projectMap = new Map(userProjects.map(p => [p.id, p]));
      const upcomingInspections = allInspections
        .filter(i => userProjectIds.has(i.projectId))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10)
        .map(i => ({
          ...i,
          projectName: projectMap.get(i.projectId)?.opportunityName || 'Unknown Project',
          opportunityId: projectMap.get(i.projectId)?.opportunityId || '',
          completedInspections: projectMap.get(i.projectId)?.completedInspections || '',
          // Scheduled types from sheet columns U-AA
          scheduledTypes: [
            projectMap.get(i.projectId)?.inspection1Type,
            projectMap.get(i.projectId)?.inspection2Type,
            projectMap.get(i.projectId)?.inspection3Type,
            projectMap.get(i.projectId)?.inspection4Type,
            projectMap.get(i.projectId)?.inspection5Type,
          ].filter((t): t is string => !!t && t.trim() !== '' && t.trim() !== '_'),
        }));

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

        // Helper: parse a date string that may be DD/MM/YYYY or MM/DD/YYYY or ISO
        // Returns { month (1-12), year } or null if unparseable
        const parseDateForMonth = (dateStr: string): { month: number; year: number } | null => {
          if (!dateStr) return null;
          const s = dateStr.trim();
          // Try DD/MM/YYYY or D/M/YYYY (Google Sheets format used in this sheet)
          const slashParts = s.split('/');
          if (slashParts.length === 3) {
            const first = parseInt(slashParts[0]);
            const second = parseInt(slashParts[1]);
            const third = parseInt(slashParts[2]);
            if (!isNaN(first) && !isNaN(second) && !isNaN(third)) {
              // If first > 12, it must be DD/MM/YYYY
              if (first > 12) {
                return { month: second, year: third };
              }
              // If second > 12, it must be MM/DD/YYYY
              if (second > 12) {
                return { month: first, year: third };
              }
              // Ambiguous: prefer DD/MM/YYYY since that's the Google Sheets format
              return { month: second, year: third };
            }
          }
          // Try ISO / standard JS parse as fallback
          const parsed = new Date(s);
          if (!isNaN(parsed.getTime())) {
            return { month: parsed.getMonth() + 1, year: parsed.getFullYear() };
          }
          return null;
        };

        // Filter projects with stage = Completed/Closeout where updatedOn falls in the selected month/year
        // Note: completionDate column actually stores checklist text, not a date — use updatedOn instead
        const allCompleted = allProjects.filter((p: typeof projects.$inferSelect) => {
          const stage = (p.stage || '').toLowerCase();
          if (!stage.includes('complete') && !stage.includes('closeout')) return false;
          const dateStr = (p.updatedOn || '').trim();
          if (!dateStr) return false;
          const parsed = parseDateForMonth(dateStr);
          if (!parsed) return false;
          return parsed.month === input.month && parsed.year === input.year;
        });

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

        // Count inspection reports generated in the selected month/year
        // from the inspectionReports table (createdAt timestamp)
        const allReports = await db_instance.select().from(inspectionReports);
        const reportsInMonth = allReports.filter(r => {
          if (!r.createdAt) return false;
          const d = new Date(r.createdAt);
          return (d.getMonth() + 1) === input.month && d.getFullYear() === input.year;
        });

        return {
          employees: result,
          totalCompletedProjects: allCompleted.length,
          totalReportsGenerated: reportsInMonth.length,
          availableEmployees: Array.from(allEmployees).sort(),
          month: input.month,
          year: input.year,
        };
      }),
  }),

  // Subcontractor management — admin assigns projects to subcontractor users
  subcontractors: router({
    // List all users with subcontractor role
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new Error('Forbidden');
      const database = await db.getDb();
      if (!database) return [];
      const subs = await database.select().from(users).where(eq(users.role, 'subcontractor'));
      return subs;
    }),

    // List all users (for admin to promote/demote)
    listAllUsers: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new Error('Forbidden');
      const database = await db.getDb();
      if (!database) return [];
      const allUsers = await database.select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        company: users.company,
        createdAt: users.createdAt,
        lastSignedIn: users.lastSignedIn,
      }).from(users);
      return allUsers;
    }),

    // Update a user's role
    updateRole: protectedProcedure
      .input(z.object({ userId: z.number(), role: z.enum(['user', 'admin', 'subcontractor']) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new Error('Forbidden');
        const database = await db.getDb();
        if (!database) throw new Error('Database unavailable');
        await database.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
        return { success: true };
      }),

    // Get projects assigned to a subcontractor
    getAssignedProjects: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new Error('Forbidden');
        const database = await db.getDb();
        if (!database) return [];
        const rows = await database.select().from(projectAccess).where(eq(projectAccess.userId, input.userId));
        const projectIds = rows.map(r => r.projectId);
        if (projectIds.length === 0) return [];
        const assigned = await database.select({
          id: projects.id,
          opportunityName: projects.opportunityName,
          address: projects.address,
          stage: projects.stage,
          company: projects.company,
        }).from(projects).where(inArray(projects.id, projectIds));
        return assigned;
      }),

    // Assign a project to a subcontractor
    assignProject: protectedProcedure
      .input(z.object({ userId: z.number(), projectId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new Error('Forbidden');
        const database = await db.getDb();
        if (!database) throw new Error('Database unavailable');
        // Check if already assigned
        const existing = await database.select().from(projectAccess)
          .where(and(eq(projectAccess.userId, input.userId), eq(projectAccess.projectId, input.projectId)));
        if (existing.length > 0) return { success: true, alreadyExists: true };
        await database.insert(projectAccess).values({
          userId: input.userId,
          projectId: input.projectId,
          grantedBy: ctx.user.email || 'admin',
        });
        return { success: true };
      }),

    // Remove a project from a subcontractor
    removeProject: protectedProcedure
      .input(z.object({ userId: z.number(), projectId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new Error('Forbidden');
        const database = await db.getDb();
        if (!database) throw new Error('Database unavailable');
        await database.delete(projectAccess)
          .where(and(eq(projectAccess.userId, input.userId), eq(projectAccess.projectId, input.projectId)));
        return { success: true };
      }),
  }),

  // Plans Upload — creates a Drive folder via Apps Script and logs to Client Uploads sheet
  reschedule: router({
    submit: protectedProcedure
      .input(z.object({
        opportunityName: z.string(),
        pipeline: z.string().optional(),
        company: z.string().optional(),
        opportunityId: z.string().optional(),
        contactId: z.string().optional(),
        inspectionType: z.string().min(1),
        newNotesDate: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        await appendReschedule({
          opportunityName: input.opportunityName,
          email: ctx.user.email || 'unknown',
          pipeline: input.pipeline || '',
          company: input.company || ctx.user.company || '',
          opportunityId: input.opportunityId || '',
          contactId: input.contactId || '',
          inspectionType: input.inspectionType,
          newNotesDate: input.newNotesDate,
        });
        return { success: true };
      }),
  }),

  plansUpload: router({
    submitLink: protectedProcedure
      .input(z.object({
        address: z.string().min(1),
        dropboxLink: z.string().url(),
        notes: z.string().optional(),
        oppId: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await appendPlansUpload({
          address: input.address,
          dropboxLink: input.dropboxLink,
          notes: input.notes || '',
          oppId: input.oppId || '',
          uploaderEmail: ctx.user.email || 'unknown',
          company: ctx.user.company || '',
          notifyEmail: 'bccsfla@gmail.com',
          ccEmail: 'bccsfladtm@gmail.com',
        });
        return { success: true };
      }),
  }),

  requiredInspections: router({
    // Get all required inspections for a project
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || (ctx.user.role !== 'admin' && ctx.user.company !== 'ALL' && ctx.user.company && !companiesMatch(project.company, ctx.user.company))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this project' });
        }
        return await db.getRequiredInspectionsByProjectId(input.projectId);
      }),

    // Generate required inspections from a permit type + subtype template
    generate: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        permitType: z.string().min(1),
        subType: z.string().min(1),
        inspections: z.array(z.object({
          section: z.string(),
          name: z.string(),
          sortOrder: z.number().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can set required inspections' });
        }
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });

        // Remove existing entries for this permit+subtype combo on this project
        await db.deleteRequiredInspectionsByProjectAndPermit(input.projectId, input.permitType, input.subType);

        // Insert new entries
        for (let i = 0; i < input.inspections.length; i++) {
          const insp = input.inspections[i];
          await db.createRequiredInspection({
            projectId: input.projectId,
            permitType: input.permitType,
            subType: input.subType,
            section: insp.section,
            inspectionName: insp.name,
            sortOrder: insp.sortOrder ?? i,
            addedBy: ctx.user.email || '',
          });
        }
        return { success: true };
      }),

    // Add a single custom required inspection to a project
    add: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        permitType: z.string().min(1),
        subType: z.string().min(1),
        section: z.string().default('CUSTOM'),
        inspectionName: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can add required inspections' });
        }
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });

        await db.createRequiredInspection({
          projectId: input.projectId,
          permitType: input.permitType,
          subType: input.subType,
          section: input.section,
          inspectionName: input.inspectionName,
          sortOrder: 999,
          addedBy: ctx.user.email || '',
        });
        return { success: true };
      }),

    // Delete a single required inspection from a project
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can delete required inspections' });
        }
        await db.deleteRequiredInspection(input.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
