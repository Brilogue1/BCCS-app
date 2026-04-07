import { describe, it, expect } from "vitest";
import { getLicenseNumber } from "./reportGenerator";
import { schedulerState } from "./reportScheduler";

describe("getLicenseNumber", () => {
  it("returns BN6824 (inspector) for MECH ROUGH inspections by TIM MILLER", () => {
    expect(getLicenseNumber("TIM MILLER", "MECH ROUGH")).toBe("BN6824");
  });

  it("returns BN6824 (inspector) for BLDG FRAMING ROUGH inspections by TIM MILLER", () => {
    expect(getLicenseNumber("TIM MILLER", "BLDG FRAMING ROUGH")).toBe("BN6824");
  });

  it("returns BN6824 (inspector) for PLUMB ROUGH inspections by TIM MILLER", () => {
    expect(getLicenseNumber("TIM MILLER", "PLUMB ROUGH - 1ST")).toBe("BN6824");
  });

  it("returns BN6824 (inspector) for ELECT UNDERGROUND inspections by TIM MILLER", () => {
    expect(getLicenseNumber("TIM MILLER", "ELECT UNDERGROUND")).toBe("BN6824");
  });

  it("returns PX3701 (plans examining) for PLAN REVIEW inspections by TIM MILLER", () => {
    expect(getLicenseNumber("TIM MILLER", "PLAN REVIEW")).toBe("PX3701");
  });

  it("returns BN6824 (inspector) for BLDG ADA SITE PREPOUR by TIM MILLER", () => {
    expect(getLicenseNumber("TIM MILLER", "BLDG ADA SITE PREPOUR")).toBe("BN6824");
  });

  it("returns empty string for unknown inspector", () => {
    expect(getLicenseNumber("UNKNOWN PERSON", "MECH ROUGH")).toBe("");
  });

  it("returns empty string for empty inspector name", () => {
    expect(getLicenseNumber("", "MECH ROUGH")).toBe("");
  });

  it("is case-insensitive for inspector name", () => {
    expect(getLicenseNumber("Tim Miller", "MECH ROUGH")).toBe("BN6824");
    expect(getLicenseNumber("tim miller", "BLDG SLAB")).toBe("BN6824");
  });
});

describe("schedulerState", () => {
  it("initializes with isRunning = false", () => {
    expect(schedulerState.isRunning).toBe(false);
  });

  it("initializes with null lastRunAt", () => {
    expect(schedulerState.lastRunAt).toBeNull();
  });
});
