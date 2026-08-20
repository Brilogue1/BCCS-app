import { describe, expect, it } from "vitest";
import { getVisibleCompletedProjectDownloads, hasPendingProjectAssignment } from "../shared/utils";

describe("admin dashboard follow-up controls", () => {
  it("requires a selected project before enabling the assignment save", () => {
    expect(hasPendingProjectAssignment(null)).toBe(false);
    expect(hasPendingProjectAssignment(0)).toBe(false);
    expect(hasPendingProjectAssignment(42)).toBe(true);
  });

  it("shows four completed-project downloads until Show All is chosen", () => {
    const projects = [1, 2, 3, 4, 5, 6];
    expect(getVisibleCompletedProjectDownloads(projects, false)).toEqual([1, 2, 3, 4]);
    expect(getVisibleCompletedProjectDownloads(projects, true)).toEqual(projects);
  });
});
