import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// Mock project data for testing
const mockProjects = [
  {
    id: 1,
    opportunityName: "Project Alpha",
    contactName: "John Doe",
    company: "Acme Corp",
    address: "123 Main St",
    lotNumber: "101",
    completionDate: "2025-09-15",
    stage: "Complete",
    assignedPermitTech: "TIM MILLER",
    assignedPlansExaminer: "TIM MILLER",
    assignedInspector: "GRANT ROWLAND",
    updatedOn: "2025-09-15T10:00:00.000Z",
    permitNumber: "P-001",
    inspection1Type: "Structural",
    inspection2Type: null,
    inspection3Type: null,
    inspection4Type: null,
    inspection5Type: null,
    inspection1Result: "Approved",
    inspection2Result: null,
    inspection3Result: null,
    planningChecklist: null,
    permittingChecklist: null,
    inspectionChecklist: null,
    phone: null,
    email: null,
    pipeline: null,
    leadValue: null,
    source: null,
    assigned: null,
    createdOn: "2025-01-10",
    lostReasonId: null,
    lostReasonName: null,
    followers: null,
    notes: null,
    tag: null,
    subdivision: null,
    proposalSent: null,
    proposalSigned: null,
    completionStatus: null,
    opportunityId: null,
    lastUpdated: null,
    syncedAt: new Date(),
  },
  {
    id: 2,
    opportunityName: "Project Beta",
    contactName: "Jane Smith",
    company: "Beta Inc",
    address: "456 Oak Ave",
    lotNumber: "202",
    completionDate: "2025-09-20",
    stage: "Closeout",
    assignedPermitTech: "TIM MILLER",
    assignedPlansExaminer: "",
    assignedInspector: "",
    updatedOn: "2025-09-20T14:00:00.000Z",
    permitNumber: "P-002",
    inspection1Type: null,
    inspection2Type: null,
    inspection3Type: null,
    inspection4Type: null,
    inspection5Type: null,
    inspection1Result: null,
    inspection2Result: null,
    inspection3Result: null,
    planningChecklist: null,
    permittingChecklist: null,
    inspectionChecklist: null,
    phone: null,
    email: null,
    pipeline: null,
    leadValue: null,
    source: null,
    assigned: null,
    createdOn: "2025-02-15",
    lostReasonId: null,
    lostReasonName: null,
    followers: null,
    notes: null,
    tag: null,
    subdivision: null,
    proposalSent: null,
    proposalSigned: null,
    completionStatus: null,
    opportunityId: null,
    lastUpdated: null,
    syncedAt: new Date(),
  },
  {
    id: 3,
    opportunityName: "Project Gamma",
    contactName: "Bob Wilson",
    company: "Gamma LLC",
    address: "789 Pine Rd",
    lotNumber: "303",
    completionDate: "2025-09-10",
    stage: "Complete",
    assignedPermitTech: "",
    assignedPlansExaminer: "",
    assignedInspector: "",
    updatedOn: "2025-09-10T08:00:00.000Z",
    permitNumber: null,
    inspection1Type: null,
    inspection2Type: null,
    inspection3Type: null,
    inspection4Type: null,
    inspection5Type: null,
    inspection1Result: null,
    inspection2Result: null,
    inspection3Result: null,
    planningChecklist: null,
    permittingChecklist: null,
    inspectionChecklist: null,
    phone: null,
    email: null,
    pipeline: null,
    leadValue: null,
    source: null,
    assigned: null,
    createdOn: "2025-03-01",
    lostReasonId: null,
    lostReasonName: null,
    followers: null,
    notes: null,
    tag: null,
    subdivision: null,
    proposalSent: null,
    proposalSigned: null,
    completionStatus: null,
    opportunityId: null,
    lastUpdated: null,
    syncedAt: new Date(),
  },
  {
    id: 4,
    opportunityName: "Project Delta",
    contactName: "Alice Brown",
    company: "Delta Co",
    address: "321 Elm St",
    lotNumber: "404",
    completionDate: "10/15/2025",
    stage: "Complete",
    assignedPermitTech: "TAMMY VIVI",
    assignedPlansExaminer: "",
    assignedInspector: "TAMMY VIVI",
    updatedOn: "2025-10-15T12:00:00.000Z",
    permitNumber: "P-004",
    inspection1Type: "Electrical",
    inspection2Type: null,
    inspection3Type: null,
    inspection4Type: null,
    inspection5Type: null,
    inspection1Result: "Approved",
    inspection2Result: null,
    inspection3Result: null,
    planningChecklist: null,
    permittingChecklist: null,
    inspectionChecklist: null,
    phone: null,
    email: null,
    pipeline: null,
    leadValue: null,
    source: null,
    assigned: null,
    createdOn: null,
    lostReasonId: null,
    lostReasonName: null,
    followers: null,
    notes: null,
    tag: null,
    subdivision: null,
    proposalSent: null,
    proposalSigned: null,
    completionStatus: null,
    opportunityId: null,
    lastUpdated: null,
    syncedAt: new Date(),
  },
  {
    id: 5,
    opportunityName: "Active Project",
    contactName: "Charlie Green",
    company: "Green Inc",
    address: "555 Maple Dr",
    lotNumber: "505",
    completionDate: null,
    stage: "Inspections",
    assignedPermitTech: "TIM MILLER",
    assignedPlansExaminer: "TIM MILLER",
    assignedInspector: "GRANT ROWLAND",
    updatedOn: "2025-09-25T16:00:00.000Z",
    permitNumber: "P-005",
    inspection1Type: null,
    inspection2Type: null,
    inspection3Type: null,
    inspection4Type: null,
    inspection5Type: null,
    inspection1Result: null,
    inspection2Result: null,
    inspection3Result: null,
    planningChecklist: null,
    permittingChecklist: null,
    inspectionChecklist: null,
    phone: null,
    email: null,
    pipeline: null,
    leadValue: null,
    source: null,
    assigned: null,
    createdOn: null,
    lostReasonId: null,
    lostReasonName: null,
    followers: null,
    notes: null,
    tag: null,
    subdivision: null,
    proposalSent: null,
    proposalSigned: null,
    completionStatus: null,
    opportunityId: null,
    lastUpdated: null,
    syncedAt: new Date(),
  },
];

// Mock the db module
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: () => ({
      from: () => Promise.resolve(mockProjects),
    }),
  }),
}));

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createRegularUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("employeeReport.monthly", () => {
  it("returns completed projects for September 2025 with correct structure", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.employeeReport.monthly({
      month: 9,
      year: 2025,
    });

    expect(result).toHaveProperty("employees");
    expect(result).toHaveProperty("totalCompletedProjects");
    expect(result).toHaveProperty("availableEmployees");
    expect(result).toHaveProperty("month", 9);
    expect(result).toHaveProperty("year", 2025);
  });

  it("finds projects with completionDate in the target month", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.employeeReport.monthly({
      month: 9,
      year: 2025,
    });

    // Project Alpha has completionDate "2025-09-15" - should be included
    // It has TIM MILLER (Permit + Plans) and GRANT ROWLAND (Inspection)
    expect(result.totalCompletedProjects).toBeGreaterThanOrEqual(1);
  });

  it("finds completed projects by their authoritative closeout date", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.employeeReport.monthly({
      month: 9,
      year: 2025,
    });

    // Project Beta and Project Gamma have September closeout dates and should be included.
    expect(result.totalCompletedProjects).toBeGreaterThanOrEqual(3);
  });

  it("groups unassigned projects under 'Unassigned' employee", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.employeeReport.monthly({
      month: 9,
      year: 2025,
    });

    // Project Gamma has no employees assigned (all empty strings)
    const unassigned = result.employees.find(e => e.employee === "Unassigned");
    expect(unassigned).toBeDefined();
    expect(unassigned!.projects.length).toBeGreaterThanOrEqual(1);
    expect(unassigned!.projects[0].type).toBe("Unassigned");
  });

  it("assigns correct role types to employees", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.employeeReport.monthly({
      month: 9,
      year: 2025,
    });

    // TIM MILLER should have Permit & Plans roles from Project Alpha
    const tim = result.employees.find(e => e.employee === "TIM MILLER");
    expect(tim).toBeDefined();
    if (tim) {
      const alphaProject = tim.projects.find(p => p.projectId === 1);
      expect(alphaProject).toBeDefined();
      // TIM MILLER has Permit + Plans on Project Alpha
      expect(alphaProject!.type).toContain("Permit");
      expect(alphaProject!.type).toContain("Plans");
    }

    // GRANT ROWLAND should have Inspection role from Project Alpha
    const grant = result.employees.find(e => e.employee === "GRANT ROWLAND");
    expect(grant).toBeDefined();
    if (grant) {
      const alphaProject = grant.projects.find(p => p.projectId === 1);
      expect(alphaProject).toBeDefined();
      expect(alphaProject!.type).toBe("Inspection");
    }
  });

  it("does not include active (non-complete) projects", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.employeeReport.monthly({
      month: 9,
      year: 2025,
    });

    // "Active Project" (id=5) is in "Inspections" stage with no completionDate
    const allProjectIds = result.employees.flatMap(e => e.projects.map(p => p.projectId));
    expect(allProjectIds).not.toContain(5);
  });

  it("handles MM/DD/YYYY date format for completionDate", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.employeeReport.monthly({
      month: 10,
      year: 2025,
    });

    // Project Delta has completionDate "10/15/2025" in MM/DD/YYYY format
    expect(result.totalCompletedProjects).toBeGreaterThanOrEqual(1);
    const tammy = result.employees.find(e => e.employee === "TAMMY VIVI");
    expect(tammy).toBeDefined();
  });

  it("filters by employee name when provided", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.employeeReport.monthly({
      month: 9,
      year: 2025,
      employee: "GRANT",
    });

    // Should only return GRANT ROWLAND's entries
    expect(result.employees.length).toBe(1);
    expect(result.employees[0].employee).toBe("GRANT ROWLAND");
  });

  it("returns empty results for months with no completed projects", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.employeeReport.monthly({
      month: 1,
      year: 2025,
    });

    expect(result.totalCompletedProjects).toBe(0);
    expect(result.employees).toHaveLength(0);
  });

  it("returns available employees from all projects", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.employeeReport.monthly({
      month: 9,
      year: 2025,
    });

    // Available employees should include all assigned employees across all projects
    expect(result.availableEmployees).toContain("TIM MILLER");
    expect(result.availableEmployees).toContain("GRANT ROWLAND");
    expect(result.availableEmployees).toContain("TAMMY VIVI");
    // Empty strings should not be in the list
    expect(result.availableEmployees).not.toContain("");
  });

  it("rejects non-admin users", async () => {
    const ctx = createRegularUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.employeeReport.monthly({ month: 9, year: 2025 })
    ).rejects.toThrow("Unauthorized");
  });

  it("uses the closeout date as the completed date and includes project started date", async () => {
    const ctx = createAdminContext();
    const caller
 = appRouter.createCaller(ctx);

    const result = await caller.employeeReport.monthly({
      month: 9,
      year: 2025,
    });

    // Project Alpha has completionDate "2025-09-15" - should use that
    const timEntries = result.employees.find(e => e.employee === "TIM MILLER");
    const alphaProject = timEntries?.projects.find(p => p.projectId === 1);
    expect(alphaProject).toBeDefined();
    expect(alphaProject!.completionDate).toBe("2025-09-15");
    expect(alphaProject!.createdOn).toBe("2025-01-10");

    // Project Gamma is unassigned and uses its explicit closeout date.
    const unassigned = result.employees.find(e => e.employee === "Unassigned");
    const gammaProject = unassigned?.projects.find(p => p.projectId === 3);
    expect(gammaProject?.completionDate).toBe("2025-09-10");
  });

  it("sorts employees alphabetically", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.employeeReport.monthly({
      month: 9,
      year: 2025,
    });

    const names = result.employees.map(e => e.employee);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });
});
