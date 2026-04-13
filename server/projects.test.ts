import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: {
      id: 1,
      openId: "admin-openid",
      email: "bri@bccsfl.com",
      name: "Bri",
      loginMethod: "password",
      role: "admin",
      company: "ALL",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as AuthenticatedUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
      setHeader: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
  return { ctx };
}

function createUserContext(company: string): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: {
      id: 2,
      openId: "user-openid",
      email: "user@example.com",
      name: "Test User",
      loginMethod: "password",
      role: "user",
      company,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as AuthenticatedUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
      setHeader: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
  return { ctx };
}

const mockProject = {
  id: 9999,
  opportunityId: "T2GBPKGCkVDC0gbD2JRu",
  opportunityName: "221 Temple Dr - Hurrican Dmg FRANKS",
  contactName: "Craig Connor",
  phone: "(352) 538-0925",
  email: "cconnor77@gmail.com",
  pipeline: null,
  stage: "Inspections",
  leadValue: null,
  source: null,
  assigned: null,
  createdOn: null,
  updatedOn: null,
  lostReasonId: null,
  lostReasonName: null,
  followers: null,
  notes: null,
  tag: null,
  address: "221 Temple Dr Ft Myers FL 33905",
  subdivision: null,
  lotNumber: null,
  permitNumber: "MRV2026-00047",
  assignedPermitTech: "CINDI WILLIS",
  assignedPlansExaminer: null,
  assignedInspector: "TIM MILLER",
  planningChecklist: null,
  permittingChecklist: null,
  inspectionChecklist: null,
  inspection1Result: null,
  inspection2Result: null,
  inspection3Result: null,
  inspection1Type: null,
  inspection2Type: null,
  inspection3Type: null,
  inspection4Type: null,
  inspection5Type: null,
  proposalSent: null,
  proposalSigned: null,
  company: "Craig Connor",
  completionStatus: null,
  completedInspections: null,
  contactId: null,
  completionDate: null,
  lastUpdated: null,
  syncedAt: new Date(),
};

describe("projects.getByOpportunityId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return a project by opportunityId for admin users", async () => {
    vi.spyOn(db, "getProjectByOpportunityId").mockResolvedValue(mockProject);

    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.projects.getByOpportunityId({
      opportunityId: "T2GBPKGCkVDC0gbD2JRu",
    });

    expect(result).toBeDefined();
    expect(result.opportunityId).toBe("T2GBPKGCkVDC0gbD2JRu");
    expect(result.opportunityName).toBe("221 Temple Dr - Hurrican Dmg FRANKS");
    expect(db.getProjectByOpportunityId).toHaveBeenCalledWith("T2GBPKGCkVDC0gbD2JRu");
  });

  it("should throw NOT_FOUND when project does not exist", async () => {
    vi.spyOn(db, "getProjectByOpportunityId").mockResolvedValue(undefined);

    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.projects.getByOpportunityId({ opportunityId: "nonexistent-id" })
    ).rejects.toThrow("Project not found");
  });

  it("should throw FORBIDDEN when user company does not match project company", async () => {
    vi.spyOn(db, "getProjectByOpportunityId").mockResolvedValue(mockProject);

    const { ctx } = createUserContext("Different Company LLC");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.projects.getByOpportunityId({ opportunityId: "T2GBPKGCkVDC0gbD2JRu" })
    ).rejects.toThrow("You do not have access to this project");
  });

  it("should allow access for users with matching company", async () => {
    vi.spyOn(db, "getProjectByOpportunityId").mockResolvedValue(mockProject);

    // mockProject.company = "Craig Connor", user company = "Craig Connor"
    const { ctx } = createUserContext("Craig Connor");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.projects.getByOpportunityId({
      opportunityId: "T2GBPKGCkVDC0gbD2JRu",
    });

    expect(result).toBeDefined();
    expect(result.opportunityId).toBe("T2GBPKGCkVDC0gbD2JRu");
  });

  it("should allow access for users with ALL company access", async () => {
    vi.spyOn(db, "getProjectByOpportunityId").mockResolvedValue(mockProject);

    const { ctx } = createUserContext("ALL");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.projects.getByOpportunityId({
      opportunityId: "T2GBPKGCkVDC0gbD2JRu",
    });

    expect(result).toBeDefined();
    expect(result.opportunityId).toBe("T2GBPKGCkVDC0gbD2JRu");
  });
});

describe("stable URL routing", () => {
  it("opportunityId should be a non-numeric string (stable across syncs)", () => {
    const oppId = "T2GBPKGCkVDC0gbD2JRu";
    const isNumeric = /^\d+$/.test(oppId);
    expect(isNumeric).toBe(false);
    expect(oppId.length).toBeGreaterThan(5);
  });

  it("numeric IDs should be detected as numeric (fallback path)", () => {
    const numericId = "9999";
    const isNumeric = /^\d+$/.test(numericId);
    expect(isNumeric).toBe(true);
  });
});
