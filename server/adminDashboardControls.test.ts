import { describe, expect, it } from "vitest";
import { getVisibleInspectionReports, hasPendingRoleChange, showMoreReportCount } from "../shared/utils";

describe("admin dashboard controls", () => {
  it("only enables saving when a selected role differs from the persisted role", () => {
    expect(hasPendingRoleChange("user", "user")).toBe(false);
    expect(hasPendingRoleChange("user", "subcontractor")).toBe(true);
  });

  it("shows the newest four inspection reports first", () => {
    const reports = [
      { sheetRowIndex: 10, name: "older" },
      { sheetRowIndex: 25, name: "newest" },
      { sheetRowIndex: 20, name: "newer" },
      { sheetRowIndex: 15, name: "middle" },
      { sheetRowIndex: 5, name: "oldest" },
    ];
    expect(getVisibleInspectionReports(reports, 4).map((report) => report.name))
      .toEqual(["newest", "newer", "middle", "older"]);
  });

  it("expands the report list by five without exceeding the total", () => {
    expect(showMoreReportCount(4, 18)).toBe(9);
    expect(showMoreReportCount(14, 18)).toBe(18);
  });
});
