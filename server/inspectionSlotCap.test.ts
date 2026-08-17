import { describe, expect, it } from "vitest";
import { getPendingInspectionRequests } from "../shared/utils";

describe("getPendingInspectionRequests", () => {
  it("counts only requests that are explicitly pending", () => {
    const rows = [
      { status: "scheduled", inspectionType: "ELECT ROUGH" },
      { status: "completed", inspectionType: "PLUMB ROUGH" },
      { status: "cancelled", inspectionType: "MECH ROUGH" },
      { status: "pending", inspectionType: "INSULATION WALLS" },
    ];

    expect(getPendingInspectionRequests(rows, [])).toEqual([
      { status: "pending", inspectionType: "INSULATION WALLS" },
    ]);
  });

  it("does not double-count a pending request already occupying a GHL slot", () => {
    const rows = [
      { status: "pending", inspectionType: "BLDG FOUNDATION AND OR FOOTER" },
      { status: "pending", inspectionType: "ELECT TUG" },
    ];

    expect(getPendingInspectionRequests(rows, ["BLDG FOUNDATION AND FOOTER"]))
      .toEqual([{ status: "pending", inspectionType: "ELECT TUG" }]);
  });
});
