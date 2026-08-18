import { describe, expect, it } from "vitest";
import { projectMatchesSearch } from "../shared/utils";

describe("projectMatchesSearch", () => {
  const project = {
    opportunityName: "Landings at Lake Mabel",
    company: "KB Home",
    address: "434 Red Bay Rd",
    contactName: "Project Contact",
    lotNumber: "196",
    subdivision: "Landings at Lake Mabel",
  };

  it("matches direct, prefixed, and hash-prefixed lot-number searches", () => {
    expect(projectMatchesSearch(project, "196")).toBe(true);
    expect(projectMatchesSearch(project, " 196 ")).toBe(true);
    expect(projectMatchesSearch(project, "Lot 196")).toBe(true);
    expect(projectMatchesSearch(project, "#196")).toBe(true);
  });

  it("continues to match project name, address, subdivision, company, and contact", () => {
    expect(projectMatchesSearch(project, "lake mabel")).toBe(true);
    expect(projectMatchesSearch(project, "Landings at Lake Mabel")).toBe(true);
    expect(projectMatchesSearch(project, "red bay")).toBe(true);
    expect(projectMatchesSearch(project, "kb home")).toBe(true);
    expect(projectMatchesSearch(project, "contact")).toBe(true);
  });

  it("does not match an unrelated search", () => {
    expect(projectMatchesSearch(project, "lot 999")).toBe(false);
  });
});
