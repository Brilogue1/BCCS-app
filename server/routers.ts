import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { projects } from "../drizzle/schema";
import { fetchAllProjects, validateCredentials } from "./googleSheets";
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
        
        // Create or get user
        let user = await db.getUserByEmail(email);
        
        if (!user) {
          // Create new user with custom openId and role from sheet
          const openId = `sheet-${email}`;
          await db.upsertUser({
            openId,
            email,
            name: email.split('@')[0],
            loginMethod: 'google-sheets',
            role: (validation.role === 'admin' ? 'admin' : 'user') as 'admin' | 'user',
            lastSignedIn: new Date(),
          });
          user = await db.getUserByEmail(email);
        } else {
          // Update last signed in and role
          await db.upsertUser({
            ...user,
            role: (validation.role === 'admin' ? 'admin' : user.role || 'user') as 'admin' | 'user',
            lastSignedIn: new Date(),
          });
          user = await db.getUserByEmail(email);
        }
        
        if (!user) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create user',
          });
        }
        
        // Create JWT token
        const token = await new SignJWT({ openId: user.openId })
          .setProtectedHeader({ alg: 'HS256' })
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
      // Fetch all projects from Google Sheets
      const sheetData = await fetchAllProjects();
      
      // Transform sheet data to project records
      const projects = sheetData.map(row => {
        // Helper to safely parse dates
        const parseDate = (dateStr: string | undefined): Date | null => {
          if (!dateStr || dateStr.trim() === '') return null;
          const parsed = new Date(dateStr);
          return isNaN(parsed.getTime()) ? null : parsed;
        };

        return {
          opportunityName: row['Opportunity Name'] || '',
          contactName: row['Contact Name'] || '',
          phone: row['phone'] || '',
          email: row['email'] || '',
          pipeline: row['pipeline'] || '',
          stage: row['stage'] || '',
          leadValue: row['Lead Value'] || '',
          source: row['source'] || '',
          assigned: row['assigned'] || '',
          createdOn: row['Created on'] || '',
          updatedOn: row['Updated on'] || '',
          lostReasonId: row['lost reason ID'] || '',
          lostReasonName: row['lost reason name'] || '',
          followers: row['Followers'] || '',
          notes: row['Notes'] || '',
          tag: row['tag'] || '',
          address: row['Address'] || row['address'] || '',
          subdivision: row['Subdivision'] || row['subdivision'] || '',
          lotNumber: row['Lot #'] || row['lot'] || '',
          permitNumber: row['Permit #'] || row['permit'] || '',
          assignedPermitTech: row['Assigned Permit Tech'] || '',
          assignedPlansExaminer: row['Assigned Plans Examiner'] || '',
          assignedInspector: row['Assigned Inspector'] || '',
          lastUpdated: parseDate(row['Updated on']),
          syncedAt: new Date(),
        };
      });
      
      // Sync to database
      await db.syncAllProjects(projects);
      
      return { success: true, count: projects.length };
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
        inspectionDate: z.date(),
        inspectionTime: z.string().optional(),
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
        
        const result = await db.createInspection({
          ...input,
          createdBy: ctx.user.email || '',
          status: 'pending',
          ghlSynced: 0,
        });
        
        // Attempt to sync to GHL in background
        if (isGHLConfigured()) {
          syncInspectionToGHL({
            projectId: input.projectId,
            opportunityName: project.opportunityName || '',
            inspectionType: input.inspectionType,
            inspectionDate: input.inspectionDate,
            inspectionTime: input.inspectionTime,
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
