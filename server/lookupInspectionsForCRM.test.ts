import { describe, expect, it } from "vitest";
import { lookupInspectionsForCRM } from "../shared/utils";

describe("lookupInspectionsForCRM", () => {
  // ── Residential ──────────────────────────────────────────────────────────
  it("maps RESIDENTIAL / NEW CONSTRUCTION correctly", () => {
    const result = lookupInspectionsForCRM("RESIDENTIAL", "NEW CONSTRUCTION");
    expect(result).toEqual({
      permitType: "BUILDING SINGLE FAMILY RESIDENTIAL",
      subType: "NEW BUILDING / DUPLEX / TOWNHOUSE / ACCESSORY DWELLING",
    });
  });

  it("maps RESIDENTIAL / ADDITION / REMODEL correctly", () => {
    const result = lookupInspectionsForCRM("RESIDENTIAL", "ADDITION / REMODEL");
    expect(result).toEqual({
      permitType: "BUILDING SINGLE FAMILY RESIDENTIAL",
      subType: "ADDITION / REMODEL / DETACHED GARAGE",
    });
  });

  it("maps RESIDENTIAL / ELECTRICAL correctly", () => {
    const result = lookupInspectionsForCRM("RESIDENTIAL", "ELECTRICAL");
    expect(result?.permitType).toBe("ELECTRICAL RESIDENTIAL");
  });

  it("maps RESIDENTIAL / PLUMBING correctly", () => {
    const result = lookupInspectionsForCRM("RESIDENTIAL", "PLUMBING");
    expect(result?.permitType).toBe("PLUMBING RESIDENTIAL");
  });

  it("maps RESIDENTIAL / MECHANICAL correctly", () => {
    const result = lookupInspectionsForCRM("RESIDENTIAL", "MECHANICAL");
    expect(result?.permitType).toBe("MECHANICAL RESIDENTIAL");
  });

  it("maps RESIDENTIAL / GAS correctly", () => {
    const result = lookupInspectionsForCRM("RESIDENTIAL", "GAS");
    expect(result?.permitType).toBe("GAS RESIDENTIAL");
  });

  it("maps RESIDENTIAL / ROOF correctly", () => {
    const result = lookupInspectionsForCRM("RESIDENTIAL", "ROOF");
    expect(result?.permitType).toBe("ROOF SINGLE FAMILY RESIDENTIAL");
  });

  it("maps RESIDENTIAL / FENCE correctly", () => {
    const result = lookupInspectionsForCRM("RESIDENTIAL", "FENCE");
    expect(result?.permitType).toBe("FENCE COMMERCIAL");
  });

  it("maps RESIDENTIAL / SWIMMING POOL correctly", () => {
    const result = lookupInspectionsForCRM("RESIDENTIAL", "SWIMMING POOL");
    expect(result?.permitType).toBe("SWIMMING POOL RESIDENTIAL");
    expect(result?.subType).toBe("BELOW GROUND");
  });

  it("maps RESIDENTIAL / SIGN correctly", () => {
    const result = lookupInspectionsForCRM("RESIDENTIAL", "SIGN");
    expect(result?.permitType).toBe("SIGN NEW");
  });

  it("maps RESIDENTIAL / MOBILE HOME correctly", () => {
    const result = lookupInspectionsForCRM("RESIDENTIAL", "MOBILE HOME");
    expect(result).toEqual({
      permitType: "MOBILE HOME",
      subType: "NEW MOBILE HOME",
    });
  });

  it("maps RESIDENTIAL / CARPORT / SHED correctly", () => {
    const result = lookupInspectionsForCRM("RESIDENTIAL", "CARPORT / SHED");
    expect(result).toEqual({
      permitType: "BUILDING SINGLE FAMILY RESIDENTIAL",
      subType: "CARPORT / PATIO COVER / SHED",
    });
  });

  // ── Commercial ───────────────────────────────────────────────────────────
  it("maps COMMERCIAL / NEW CONSTRUCTION correctly", () => {
    const result = lookupInspectionsForCRM("COMMERCIAL", "NEW CONSTRUCTION");
    expect(result?.permitType).toBe("BLDG COMMERCIAL");
    expect(result?.subType).toBe("NEW BUILDING / MULTI-FAMILY / ADDITION / ACCESSORY STRUCTURE");
  });

  it("maps COMMERCIAL / ADDITION / REMODEL correctly", () => {
    const result = lookupInspectionsForCRM("COMMERCIAL", "ADDITION / REMODEL");
    expect(result?.permitType).toBe("BLDG COMMERCIAL");
    expect(result?.subType).toBe("REMODEL / INTERIOR BUILDOUT");
  });

  it("maps COMMERCIAL / ELECTRICAL correctly", () => {
    const result = lookupInspectionsForCRM("COMMERCIAL", "ELECTRICAL");
    expect(result?.permitType).toBe("ELECTRICAL COMMERCIAL");
  });

  it("maps COMMERCIAL / SWIMMING POOL correctly", () => {
    const result = lookupInspectionsForCRM("COMMERCIAL", "SWIMMING POOL");
    expect(result?.permitType).toBe("SWIMMING POOL COMM-MULTI");
  });

  // ── Case-insensitivity ───────────────────────────────────────────────────
  it("is case-insensitive for property type and work type", () => {
    expect(lookupInspectionsForCRM("residential", "new construction")).not.toBeNull();
    expect(lookupInspectionsForCRM("Residential", "New Construction")).not.toBeNull();
    expect(lookupInspectionsForCRM("COMMERCIAL", "electrical")).not.toBeNull();
  });

  // ── Unknown / null inputs ────────────────────────────────────────────────
  it("returns null for unknown property type", () => {
    expect(lookupInspectionsForCRM("INDUSTRIAL", "NEW CONSTRUCTION")).toBeNull();
  });

  it("returns null for unknown work type", () => {
    expect(lookupInspectionsForCRM("RESIDENTIAL", "UNKNOWN WORK TYPE")).toBeNull();
  });

  it("returns null for null inputs", () => {
    expect(lookupInspectionsForCRM(null, "NEW CONSTRUCTION")).toBeNull();
    expect(lookupInspectionsForCRM("RESIDENTIAL", null)).toBeNull();
    expect(lookupInspectionsForCRM(null, null)).toBeNull();
  });

  it("returns null for empty string inputs", () => {
    expect(lookupInspectionsForCRM("", "NEW CONSTRUCTION")).toBeNull();
    expect(lookupInspectionsForCRM("RESIDENTIAL", "")).toBeNull();
  });

  // ── Mobile Home and Carport/Shed are RESIDENTIAL-only ────────────────────
  it("does NOT map COMMERCIAL / MOBILE HOME (not in commercial list)", () => {
    expect(lookupInspectionsForCRM("COMMERCIAL", "MOBILE HOME")).toBeNull();
  });

  it("does NOT map COMMERCIAL / CARPORT / SHED (not in commercial list)", () => {
    expect(lookupInspectionsForCRM("COMMERCIAL", "CARPORT / SHED")).toBeNull();
  });
});
