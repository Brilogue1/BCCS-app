import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { projects } from "../drizzle/schema";
import { fetchAllProjects, validateCredentials, appendInspectionRequest, fetchPastInspections, appendClientUpload, appendNewProjectEmail } from "./googleSheets";
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
            address: getString(row['address'] || row['Address']),
            subdivision: getString(row['subdivision'] || row['Subdivision']),
            lotNumber: getString(row['lot number'] || row['Lot Number']),
            permitNumber: getString(row['permit number'] || row['Permit Number']),
            assignedPermitTech: getString(row['assign permit tech'] || row['Assign Permit tech']),
            assignedPlansExaminer: getString(row['assign plans examiner'] || row['Assign Plans Examiner']),
            assignedInspector: getString(row['assign inspector'] || row['Assign Inspector']),
            planningChecklist: getString(row['planning checklist'] || row['Planning Checklist']),
            permittingChecklist: getString(row['permitting information'] || row['PERMITTING INFORMATION']),
            inspectionChecklist: getString(row['inspection checklist'] || row['Inspection Checklist']),
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
            completionStatus: getString(row['engagement status'] || row['completed'] || row['Completed']), // Column F - Completed/Active status
            lastUpdated: parseDate(row['Updated on']),
            syncedAt: new Date(),
          }));
        
        console.log(`[Sync] Inserting ${validProjects.length} valid projects`);
        
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
        const pastInspections = rows
          .filter(row => {
            const projectName = row['project name'] || row['Project Name'];
            if (!projectName || projectName.toLowerCase() === 'project name') return false;
            const company = row['company'] || row['COMPANY'];
            if (userCompany === 'ALL') return true;
            if (!userCompany || !company) return false;
            return company.toLowerCase() === userCompany.toLowerCase();
          })
          .map((row, index) => ({
            id: `past-${index}`,
            projectName: row['project name'] || row['Project Name'] || '',
            inspectionType: row['inspection type'] || row['Inspection Type'] || '',
            approvedStatus: row['approved status'] || row['Approved Status'] || row['approved'] || row['Approved'] || '',
            dateApproved: row['date approved'] || row['Date Approved'] || '',
            company: row['company'] || row['COMPANY'] || '',
            source: 'past',
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
        
        await db.createInspection({
          ...input,
          opportunityId: project.opportunityId || '',
          createdBy: ctx.user.email || '',
          status: 'pending',
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
          'pending',
          project.opportunityId || '',
          input.notes || ''
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
        // Log to Google Sheets with project name and address
        const scheduledDateTime = new Date().toISOString();
        const inspectorName = ctx.user.name || 'Unassigned';
        
        await appendInspectionRequest(
          input.projectName,
          ctx.user.email || '',
          input.inspectionType,
          scheduledDateTime,
          inspectorName,
          'pending',
          '', // No opportunity ID for new projects
          `Address: ${input.projectAddress}${input.notes ? ` | Notes: ${input.notes}` : ''}`
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
        
        // Log upload to Google Sheets Client Uploads tab
        const company = project.company || 'Unknown';
        const projectName = project.opportunityName || 'Unknown Project';
        const email = ctx.user.email || 'Unknown';
        await appendClientUpload(company, projectName, email, input.fileUrl)
          .catch(err => console.error('[Google Sheets] Failed to log client upload:', err));
        
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
        const completedProjects = allProjects.filter(p => 
          completedStages.some(s => p.stage?.toLowerCase().includes(s.toLowerCase()))
        ).length;
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
          dateRange: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          },
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
