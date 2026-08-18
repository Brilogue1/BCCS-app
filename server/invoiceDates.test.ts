import { describe, expect, it } from "vitest";
import { getInvoiceProjectDates } from "../shared/utils";

describe("getInvoiceProjectDates", () => {
  it("returns the source created date and authoritative BC closeout date", () => {
    expect(getInvoiceProjectDates({
      createdOn: "2026-08-01",
      completionDate: "2026-08-15",
    })).toEqual({
      projectStartedDate: "2026-08-01",
      projectCompletedDate: "2026-08-15",
    });
  });

  it("does not invent a completion date when the closeout field is blank", () => {
    expect(getInvoiceProjectDates({
      createdOn: "2026-08-01",
      completionDate: "   ",
    })).toEqual({
      projectStartedDate: "2026-08-01",
      projectCompletedDate: null,
    });
  });
});
