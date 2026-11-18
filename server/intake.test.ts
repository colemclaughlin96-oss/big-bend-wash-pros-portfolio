import { describe, expect, it } from "vitest";
import { intakeQuoteFields } from "./routers/quotes";

describe("intakeQuoteFields", () => {
  it("maps all intake fields through when provided", () => {
    const out = intakeQuoteFields({
      customerCompany: "Acme LLC",
      customerAltPhone: "(202) 555-0106",
      okToText: true,
      leadSource: "Referral",
      projectType: "residential",
      floors: "2 Story",
      discountGroup: "VIP",
      squareFeetActual: "2800",
      squareFeetEstimate: "2501 - 3000 sq ft",
      basement: false,
    });
    expect(out).toEqual({
      customerCompany: "Acme LLC",
      customerAltPhone: "(202) 555-0106",
      okToText: true,
      leadSource: "Referral",
      projectType: "residential",
      floors: "2 Story",
      discountGroup: "VIP",
      squareFeetActual: "2800",
      squareFeetEstimate: "2501 - 3000 sq ft",
      basement: false,
    });
  });

  it("coerces empty strings to null for text fields", () => {
    const out = intakeQuoteFields({
      customerCompany: "",
      customerAltPhone: "",
      leadSource: "",
      floors: "",
      discountGroup: "",
    });
    expect(out.customerCompany).toBeNull();
    expect(out.customerAltPhone).toBeNull();
    expect(out.leadSource).toBeNull();
    expect(out.floors).toBeNull();
    expect(out.discountGroup).toBeNull();
  });

  it("defaults missing fields to null but preserves okToText=false", () => {
    const out = intakeQuoteFields({ okToText: false });
    expect(out.okToText).toBe(false);
    expect(out.projectType).toBeNull();
    expect(out.customerCompany).toBeNull();
    expect(out.leadSource).toBeNull();
  });

  it("returns null okToText when omitted (distinct from false)", () => {
    const out = intakeQuoteFields({});
    expect(out.okToText).toBeNull();
  });

  it("maps building-size fields and preserves basement=false vs null", () => {
    expect(intakeQuoteFields({ squareFeetActual: "", basement: false }).squareFeetActual).toBeNull();
    expect(intakeQuoteFields({ basement: false }).basement).toBe(false);
    expect(intakeQuoteFields({}).basement).toBeNull();
    expect(intakeQuoteFields({ squareFeetEstimate: "2501 - 3000 sq ft" }).squareFeetEstimate).toBe(
      "2501 - 3000 sq ft",
    );
  });

  it("preserves the commercial projectType enum value", () => {
    const out = intakeQuoteFields({ projectType: "commercial" });
    expect(out.projectType).toBe("commercial");
  });
});
