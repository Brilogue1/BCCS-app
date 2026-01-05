import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { projects } from "../drizzle/schema";
import { fetchAllProjects, validateCredentials } from "./googleSheets";
import { createHash } from "crypto";
import { syncInspectionToGHL, syncContactToGHL, isGHLConfigured } from "./ghl";
import { SignJWT } from "jose";
import { ENV } from "./_core/env";

const JWT_SECRET = new TextEncoder().encode(ENV.cookieSecret);

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    
    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const { email, password } = input;
        
        // Validate credentials against Google Sheets
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
          name: user.name || user.email || 'User'
        })
          .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
          .setIssuedAt()
          .setExpirationTime('7d')
          .sign(JWT_SECRET);
        
        // Set session cookie
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, {
          ...cookieOptions,
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });
        
        return {
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
          },
        };
      }),
    
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  projects: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      // If user is admin, return all projects
      if (ctx.user.role === 'admin') {
        const dbInstance = await db.getDb();
        if (!dbInstance) return [];
        const allProjects = await dbInstance.select().from(projects);
        return allProjects;
      }
      
      // Otherwise, filter by user email
      const userEmail = ctx.user.email;
      if (!userEmail) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'User email not found',
        });
      }
      
      const userProjects = await db.getProjectsByEmail(userEmail);
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
        
        // Verify user has access to this project (admins can see all)
        if (ctx.user.role !== 'admin' && project.email !== ctx.user.email) {
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
        
        // Clear existing projects first
        const database = await db.getDb();
        if (database) {
          const { projects: projectsTable } = await import('../drizzle/schema');
          await database.delete(projectsTable);
          console.log('[Sync] Cleared existing projects');
        }
        
        // Fetch all projects from Google Sheets
        const sheetData = await fetchAllProjects();
        console.log(`[Sync] Fetched ${sheetData.length} rows from Google Sheets`);
        
        // Transform sheet data to project records
        const projects = sheetData
          .filter(row => {
            // Filter out rows without essential data
            const opportunityName = row['Opportunity Name']?.trim() || '';
            const email = row['email']?.trim() || '';
            
            // Must have a valid opportunity name (not empty, not garbled)
            const hasValidOpportunityName = opportunityName.length > 0 && 
              !opportunityName.includes(',,') && 
              opportunityName.length < 200;
            
            // Must have a valid email with @ symbol
            const hasValidEmail = email.length > 0 && email.includes('@');
            
            // Require BOTH valid name and email
            return hasValidOpportunityName && hasValidEmail;
          })
          .map(row => {
          // Helper to safely parse dates
          const parseDate = (dateStr: string | undefined): Date | null => {
            if (!dateStr || dateStr.trim() === '') return null;
            const parsed = new Date(dateStr);
            return isNaN(parsed.getTime()) ? null : parsed;
          };

          // Helper to safely get string value
          const getString = (value: string | undefined, maxLength?: number): string => {
            if (!value || value.trim() === '') return '';
            const trimmed = value.trim();
            return maxLength ? trimmed.substring(0, maxLength) : trimmed;
          };

          return {
            opportunityName: getString(row['Opportunity Name']),
            contactName: getString(row['Contact Name']),
            phone: getString(row['phone'], 50), // Limit to 50 chars
            email: getString(row['email']),
            pipeline: getString(row['pipeline']),
            stage: getString(row['stage']),
            leadValue: getString(row['Lead Value']),
            source: getString(row['source']),
            assigned: getString(row['assigned']),
            createdOn: getString(row['Created on']),
            updatedOn: getString(row['Updated on']),
            lostReasonId: getString(row['lost reason ID']),
            lostReasonName: getString(row['lost reason name']),
            followers: getString(row['Followers']),
            notes: getString(row['Notes']),
            tag: getString(row['tags']),
            address: getString(row['Address'] || row['address']),
            subdivision: getString(row['Subdivision'] || row['subdivision']),
            lotNumber: getString(row['Lot #'] || row['lot']),
            permitNumber: getString(row['Permit #'] || row['permit']),
            assignedPermitTech: getString(row['Assign Permit tech']),
            assignedPlansExaminer: getString(row['Assign Plans Examiner']),
            assignedInspector: getString(row['Assign Inspector']),
            planningChecklist: getString(row['Planning Checklist']),
            lastUpdated: parseDate(row['Updated on']),
            syncedAt: new Date(),
          };
        });
      
        console.log(`[Sync] Filtered to ${projects.length} valid projects`);
        
        // Sync to database
        await db.syncAllProjects(projects);
        console.log('[Sync] Successfully synced to database');
        
        return {
          success: true,
          count: projects.length,
        } as const;
      } catch (error) {
        console.error('[Sync] Error during sync:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to sync projects',
        });
      }
    }),
  }),

  inspections: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        // Verify user has access to this project (admins can see all)
        const project = await db.getProjectById(input.projectId);
        if (!project || (ctx.user.role !== 'admin' && project.email !== ctx.user.email)) {
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
        // Verify user has access to this project (admins can see all)
        const project = await db.getProjectById(input.projectId);
        if (!project || (ctx.user.role !== 'admin' && project.email !== ctx.user.email)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }
        
        await db.createInspection({
          ...input,
          createdBy: ctx.user.email || '',
          status: 'pending',
          ghlSynced: 0,
        }, project);
        
        // At        // Sync to GHL if configured
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

  contacts: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        // Verify user has access to this project (admins can see all)
        const project = await db.getProjectById(input.projectId);
        if (!project || (ctx.user.role !== 'admin' && project.email !== ctx.user.email)) {
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
        // Verify user has access to this project (admins can see all)
        const project = await db.getProjectById(input.projectId);
        if (!project || (ctx.user.role !== 'admin' && project.email !== ctx.user.email)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this project',
          });
        }
        
        await db.createContactEmail({
          ...input,
          ghlSynced: 0,
        });
        
        // Attempt to sync to GHL in background
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
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteContactEmail(input.id);
        return { success: true };
      }),
  }),
  
  files: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input, ctx }) => {
        const files = await db.getProjectFiles(input.projectId);
        return files;
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
        await db.createProjectFile({
          ...input,
          uploadedBy: ctx.user.email || undefined,
        });
        
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ fileId: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteProjectFile(input.fileId);
        return { success: true };
      }),
  }),
  dashboard: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      const db_instance = await db.getDb();
      if (!db_instance) throw new Error("Database not available");
      
      const { eq } = await import("drizzle-orm");
      const { projects, inspections, projectFiles } = await import("../drizzle/schema");
      
      // Get all projects (or filtered by email if not admin)
      let allProjects = await db_instance.select().from(projects);
      if (ctx.user?.role !== 'admin') {
        allProjects = allProjects.filter(p => p.email === ctx.user?.email);
      }
      
      // Count projects by stage
      const stageCount = allProjects.reduce((acc, p) => {
        const stage = p.stage || 'Unknown';
        acc[stage] = (acc[stage] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      // Get recent inspections (last 10)
      const recentInspections = await db_instance
        .select()
        .from(inspections)
        .limit(10);
      
      // Get recent files (last 10)
      const recentFiles = await db_instance
        .select()
        .from(projectFiles)
        .limit(10);
      
      return {
        totalProjects: allProjects.length,
        projectsByStage: stageCount,
        upcomingInspections: recentInspections.filter(i => i.status === 'pending' || i.status === 'scheduled'),
        recentFiles: recentFiles,
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
        // Check if user is admin
        if (ctx.user?.role !== 'admin') {
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
          dateRange: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          },
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
