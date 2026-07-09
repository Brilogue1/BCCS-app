import { describe, expect, it } from "vitest";
import { buildFullInspectionName } from "../shared/utils";

describe("buildFullInspectionName", () => {
  it("prefixes ELECTRICAL section names", () => {
    expect(buildFullInspectionName("ELECTRICAL", "ROUGH")).toBe("ELECTRICAL ROUGH");
    expect(buildFullInspectionName("ELECTRICAL", "FINAL")).toBe("ELECTRICAL FINAL");
    expect(buildFullInspectionName("ELECTRICAL", "ABOVE CEILING")).toBe("ELECTRICAL ABOVE CEILING");
    expect(buildFullInspectionName("ELECTRICAL", "UNDER SLAB")).toBe("ELECTRICAL UNDER SLAB");
    expect(buildFullInspectionName("ELECTRICAL", "WALLS ONLY")).toBe("ELECTRICAL WALLS ONLY");
  });

  it("prefixes MECHANICAL section names", () => {
    expect(buildFullInspectionName("MECHANICAL", "ROUGH")).toBe("MECHANICAL ROUGH");
    expect(buildFullInspectionName("MECHANICAL", "FINAL")).toBe("MECHANICAL FINAL");
  });

  it("prefixes PLUMBING section names", () => {
    expect(buildFullInspectionName("PLUMBING", "FINAL")).toBe("PLUMBING FINAL");
    expect(buildFullInspectionName("PLUMBING", "ROUGH - 1ST")).toBe("PLUMBING ROUGH - 1ST");
    expect(buildFullInspectionName("PLUMBING", "ROUGH - 2ND")).toBe("PLUMBING ROUGH - 2ND");
    expect(buildFullInspectionName("PLUMBING", "SEWER LATERAL")).toBe("PLUMBING SEWER LATERAL");
    expect(buildFullInspectionName("PLUMBING", "WATER LATERAL")).toBe("PLUMBING WATER LATERAL");
    expect(buildFullInspectionName("PLUMBING", "IRRIGATION FINAL")).toBe("PLUMBING IRRIGATION FINAL");
  });

  it("prefixes GAS section names", () => {
    expect(buildFullInspectionName("GAS", "ROUGH")).toBe("GAS ROUGH");
    expect(buildFullInspectionName("GAS", "NATURAL GAS FINAL")).toBe("GAS NATURAL GAS FINAL");
  });

  it("does NOT prefix BUILDING section names (already descriptive)", () => {
    expect(buildFullInspectionName("BUILDING", "BLDG FINAL")).toBe("BLDG FINAL");
    expect(buildFullInspectionName("BUILDING", "FOOTING")).toBe("FOOTING");
    expect(buildFullInspectionName("BUILDING", "FRAMING ROUGH")).toBe("FRAMING ROUGH");
    expect(buildFullInspectionName("BUILDING", "STEMWALL")).toBe("STEMWALL");
    expect(buildFullInspectionName("BUILDING", "BLDG SLAB")).toBe("BLDG SLAB");
    expect(buildFullInspectionName("BUILDING", "SWIM POOL DECK")).toBe("SWIM POOL DECK");
  });

  it("does NOT prefix MISC section names (already descriptive)", () => {
    expect(buildFullInspectionName("MISC", "SITE/DRIVEWAY")).toBe("SITE/DRIVEWAY");
  });

  it("is case-insensitive for section input", () => {
    expect(buildFullInspectionName("Electrical", "Rough")).toBe("ELECTRICAL ROUGH");
    expect(buildFullInspectionName("mechanical", "final")).toBe("MECHANICAL FINAL");
    expect(buildFullInspectionName("Plumbing", "Final")).toBe("PLUMBING FINAL");
    expect(buildFullInspectionName("Building", "Bldg Final")).toBe("BLDG FINAL");
  });

  it("avoids double-prefixing if name already starts with section", () => {
    // e.g. if inspectionName is already "ELECTRICAL ROUGH" somehow
    expect(buildFullInspectionName("ELECTRICAL", "ELECTRICAL ROUGH")).toBe("ELECTRICAL ROUGH");
    expect(buildFullInspectionName("PLUMBING", "PLUMBING FINAL")).toBe("PLUMBING FINAL");
  });

  it("handles empty/null-like inputs gracefully", () => {
    expect(buildFullInspectionName("", "ROUGH")).toBe("ROUGH");
    expect(buildFullInspectionName("ELECTRICAL", "")).toBe("ELECTRICAL ");
  });
});
