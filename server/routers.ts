import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { projects } from "../drizzle/schema";
import { fetchAllProjects } from "./googleSheets";
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
        
        // Hash the password for comparison
        const hashedPassword = createHash('sha256').update(password).digest('hex');
        
        // Get user from database
        let user = await db.getUserByEmail(email);
        
        if (!user || user.password !== hashedPassword) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Invalid email or password',
          });
        }
        
        // Update last signed in
        await db.upsertUser({
          ...user,
          lastSignedIn: new Date(),
        });
        user = await db.getUserByEmail(email);
        
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
            const hasOpportunityName = row['Opportunity Name'] && row['Opportunity Name'].trim() !== '';
            const hasEmail = row['email'] && row['email'].trim() !== '';
            return hasOpportunityName || hasEmail;
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
        // Verify user has access to this project
        const project = await db.getProjectById(input.projectId);
        if (!project || project.email !== ctx.user.email) {
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
        // Verify user has access to this project
        const project = await db.getProjectById(input.projectId);
        if (!project || project.email !== ctx.user.email) {
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
        // Verify user has access to this project
        const project = await db.getProjectById(input.projectId);
        if (!project || project.email !== ctx.user.email) {
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
        // Verify user has access to this project
        const project = await db.getProjectById(input.projectId);
        if (!project || project.email !== ctx.user.email) {
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
});

export type AppRouter = typeof appRouter;
