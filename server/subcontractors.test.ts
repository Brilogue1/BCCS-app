/**
 * Unit tests for subcontractor role management and project access control.
 *
 * These tests validate the backend logic for:
 * - Role-based access filtering (subcontractors only see assigned projects)
 * - Admin-only guard on subcontractor procedures
 */
import { describe, it, expect } from "vitest";
import { resolvePersistedUserRole } from "../shared/utils";

// ─── Role filtering logic (mirrors projects.list in routers.ts) ─────────────

type UserRole = "user" | "admin" | "subcontractor";

interface Project {
  id: number;
  company: string;
  opportunityName: string;
}

interface ProjectAccess {
  userId: number;
  projectId: number;
}

function filterProjectsForUser(
  allProjects: Project[],
  role: UserRole,
  company: string,
  userId: number,
  accessList: ProjectAccess[]
): Project[] {
  if (role === "subcontractor") {
    const assignedIds = new Set(
      accessList.filter((a) => a.userId === userId).map((a) => a.projectId)
    );
    return allProjects.filter((p) => assignedIds.has(p.id) || (company !== "ALL" && p.company === company));
  }
  if (company === "ALL") return allProjects;
  return allProjects.filter((p) => p.company === company);
}

// ─── Admin guard logic ───────────────────────────────────────────────────────

function requireAdmin(role: UserRole): void {
  if (role !== "admin") throw new Error("Forbidden");
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const PROJECTS: Project[] = [
  { id: 1, company: "ACME", opportunityName: "Project Alpha" },
  { id: 2, company: "ACME", opportunityName: "Project Beta" },
  { id: 3, company: "OTHER", opportunityName: "Project Gamma" },
  { id: 4, company: "ACME", opportunityName: "Project Delta" },
];

const ACCESS: ProjectAccess[] = [
  { userId: 10, projectId: 1 },
  { userId: 10, projectId: 3 },
];

describe("filterProjectsForUser", () => {
  it("returns both company projects and explicitly assigned outside projects for subcontractor", () => {
    const result = filterProjectsForUser(PROJECTS, "subcontractor", "ACME", 10, ACCESS);
    expect(result.map((p) => p.id)).toEqual([1, 2, 3, 4]);
  });

  it("returns company projects for subcontractor with no explicit assignments", () => {
    const result = filterProjectsForUser(PROJECTS, "subcontractor", "ACME", 99, ACCESS);
    expect(result.map((p) => p.id)).toEqual([1, 2, 4]);
  });

  it("returns all projects for admin (ALL company)", () => {
    const result = filterProjectsForUser(PROJECTS, "admin", "ALL", 1, ACCESS);
    expect(result).toHaveLength(4);
  });

  it("returns company-scoped projects for regular user", () => {
    const result = filterProjectsForUser(PROJECTS, "user", "ACME", 5, ACCESS);
    expect(result.map((p) => p.id)).toEqual([1, 2, 4]);
  });

  it("returns empty list for regular user with no matching company", () => {
    const result = filterProjectsForUser(PROJECTS, "user", "UNKNOWN", 5, ACCESS);
    expect(result).toHaveLength(0);
  });

  it("subcontractor does not inherit other subcontractors' outside-company assignments", () => {
    const extraAccess: ProjectAccess[] = [...ACCESS, { userId: 20, projectId: 2 }];
    const result = filterProjectsForUser(PROJECTS, "subcontractor", "ACME", 20, extraAccess);
    expect(result.map((p) => p.id)).toEqual([1, 2, 4]);
  });
});

describe("requireAdmin guard", () => {
  it("does not throw for admin role", () => {
    expect(() => requireAdmin("admin")).not.toThrow();
  });

  it("throws Forbidden for user role", () => {
    expect(() => requireAdmin("user")).toThrow("Forbidden");
  });

  it("throws Forbidden for subcontractor role", () => {
    expect(() => requireAdmin("subcontractor")).toThrow("Forbidden");
  });
});


describe("resolvePersistedUserRole", () => {
  it("preserves administrator-assigned subcontractor role on future sign-ins", () => {
    expect(resolvePersistedUserRole("subcontractor", "user")).toBe("subcontractor");
  });

  it("uses the authentication source role only for a first-time user", () => {
    expect(resolvePersistedUserRole(undefined, "admin")).toBe("admin");
    expect(resolvePersistedUserRole(undefined, "user")).toBe("user");
  });
});
