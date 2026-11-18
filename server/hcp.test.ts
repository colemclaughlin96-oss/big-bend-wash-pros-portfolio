import { describe, expect, it } from "vitest";
import {
  splitName,
  normalizePhone,
  dollarsToCents,
  matchCustomer,
  buildCustomerBody,
  reconcileCustomerBody,
  normalizeState,
  buildCustomerAddresses,
  buildEstimateBody,
  mergeTag,
  buildSendNote,
  buildJobBody,
  buildApprovalNote,
  buildDeclineNote,
  resolveHeadlineTier,
  type HcpCustomer,
} from "./hcp";
import type { Quote, ComputedTier } from "../drizzle/schema";

// ---- Fixtures ----

const TIERS: ComputedTier[] = [
  { key: "weekly", name: "Weekly", description: "Every week", features: ["a", "b"], total: 400, highlighted: false },
  { key: "biweekly", name: "Bi-Weekly", description: "Every 2 weeks", features: ["c"], total: 310, highlighted: true },
  { key: "monthly", name: "Monthly", description: "Once a month", features: [], total: 250 },
];

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  const base = {
    customerName: "Taylor Sample",
    customerEmail: "taylor@example.com",
    customerPhone: "(202) 555-0102",
    customerCompany: "Sample LLC",
    propertyAddress: "123 Main St",
    propertyCity: "Mead",
    propertyState: "CO",
    propertyZip: "80542",
    leadSource: "Facebook",
    publicToken: "tok123",
    computedTiers: TIERS,
    selectedTierKey: "biweekly",
    hcpCustomerId: null,
    hcpEstimateId: null,
    hcpJobId: null,
  };
  // The pure helpers under test only read the fields above; cast the rest.
  return { ...base, ...overrides } as unknown as Quote;
}

// ---- splitName ----

describe("splitName", () => {
  it("splits first and last", () => {
    expect(splitName("Taylor Sample")).toEqual({ first_name: "Taylor", last_name: "Sample" });
  });
  it("keeps multi-word last names", () => {
    expect(splitName("Mary Jane Watson")).toEqual({ first_name: "Mary", last_name: "Jane Watson" });
  });
  it("handles single name", () => {
    expect(splitName("Cher")).toEqual({ first_name: "Cher", last_name: "" });
  });
  it("handles empty", () => {
    expect(splitName("")).toEqual({ first_name: "", last_name: "" });
  });
});

// ---- normalizePhone ----

describe("normalizePhone", () => {
  it("strips non-digits", () => {
    expect(normalizePhone("(202) 555-0102")).toBe("2025550102");
  });
  it("handles null/undefined", () => {
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone(undefined)).toBe("");
  });
});

// ---- dollarsToCents ----

describe("dollarsToCents", () => {
  it("converts whole dollars", () => {
    expect(dollarsToCents(310)).toBe(31000);
  });
  it("rounds fractional cents", () => {
    expect(dollarsToCents(310.5)).toBe(31050);
    expect(dollarsToCents(99.999)).toBe(10000);
  });
  it("handles zero and bad input", () => {
    expect(dollarsToCents(0)).toBe(0);
    expect(dollarsToCents(NaN)).toBe(0);
  });
});

// ---- matchCustomer ----

describe("matchCustomer", () => {
  const candidates: HcpCustomer[] = [
    { id: "c1", email: "other@example.com", mobile_number: "2025550103", first_name: "Sam", last_name: "Smith" },
    { id: "c2", email: "TAYLOR@example.com", mobile_number: "2025550102", first_name: "Taylor", last_name: "Sample" },
  ];

  it("prefers exact email (case-insensitive)", () => {
    expect(matchCustomer(candidates, { email: "taylor@example.com" })).toEqual({ id: "c2", basis: "email" });
  });
  it("falls back to phone when email absent", () => {
    expect(matchCustomer(candidates, { phone: "(202) 555-0102" })).toEqual({ id: "c2", basis: "phone" });
  });
  it("falls back to name when email/phone absent", () => {
    expect(matchCustomer(candidates, { name: "taylor sample" })).toEqual({ id: "c2", basis: "name" });
  });
  it("returns null when nothing matches", () => {
    expect(matchCustomer(candidates, { email: "nope@x.com" })).toBeNull();
  });
  it("email takes priority over a different phone match", () => {
    // email matches c2, phone would match c1 — email wins
    const m = matchCustomer(candidates, { email: "taylor@example.com", phone: "2025550103" });
    expect(m).toEqual({ id: "c2", basis: "email" });
  });
});

// ---- buildCustomerAddresses / buildCustomerBody ----

describe("buildCustomerBody", () => {
  it("maps name, contact, company, and a service address", () => {
    const body = buildCustomerBody(makeQuote());
    expect(body).toMatchObject({
      first_name: "Taylor",
      last_name: "Sample",
      email: "taylor@example.com",
      mobile_number: "(202) 555-0102",
      company: "Sample LLC",
      notifications_enabled: false,
    });
    // lead_source is intentionally omitted (HCP validates it account-side).
    expect(body).not.toHaveProperty("lead_source");
    expect(body.addresses).toEqual([
      { type: "service", street: "123 Main St", city: "Mead", state: "CO", zip: "80542" },
    ]);
  });
  it("omits address when no location fields", () => {
    const q = makeQuote({ propertyAddress: "", propertyCity: "", propertyState: "", propertyZip: "" });
    expect(buildCustomerAddresses(q)).toEqual([]);
    expect(buildCustomerBody(q).addresses).toBeUndefined();
  });
  it("never sends lead_source even when the quote has one", () => {
    const q = makeQuote({ leadSource: "Google Ads" });
    expect(buildCustomerBody(q)).not.toHaveProperty("lead_source");
  });
});

describe("normalizeState", () => {
  it("trims trailing/leading whitespace and uppercases a 2-letter code", () => {
    expect(normalizeState("wa ")).toBe("WA");
    expect(normalizeState("  ca")).toBe("CA");
    expect(normalizeState("Wa")).toBe("WA");
  });
  it("maps full state names to the 2-letter code", () => {
    expect(normalizeState("Washington")).toBe("WA");
    expect(normalizeState("new york")).toBe("NY");
    expect(normalizeState("COLORADO")).toBe("CO");
  });
  it("returns empty for unknown/invalid values so the field is omitted", () => {
    expect(normalizeState("")).toBe("");
    expect(normalizeState(null)).toBe("");
    expect(normalizeState("Notastate")).toBe("");
  });
});

describe("buildCustomerAddresses state handling (regression: 'State must be 2 letters')", () => {
  it("normalizes a 'wa ' state with a trailing space to 'WA'", () => {
    const q = makeQuote({
      propertyAddress: "123 example st ",
      propertyCity: "seattle",
      propertyState: "wa ",
      propertyZip: "98101",
    });
    const [addr] = buildCustomerAddresses(q);
    expect(addr.state).toBe("WA");
    expect(addr.street).toBe("123 example st");
    expect(addr.city).toBe("seattle");
    expect(addr.zip).toBe("98101");
  });
  it("omits the state field entirely when it can't be normalized", () => {
    const q = makeQuote({ propertyState: "Notastate", propertyCity: "Town" });
    const [addr] = buildCustomerAddresses(q);
    expect(addr).not.toHaveProperty("state");
  });
});

describe("reconcileCustomerBody", () => {
  it("corrects a stale matched name (Example Services -> Jordan Example) keeping company", () => {
    const q = makeQuote({
      customerName: "Jordan  Example", // note: double space, must still split right
      customerCompany: "Example Services",
      customerEmail: "jordan@example.com",
      customerPhone: "2025550104",
    });
    const existing: HcpCustomer = {
      id: "cus_x",
      first_name: "Example Services",
      last_name: "Example Services",
      company: "Example Services",
      email: "jordan@example.com",
      mobile_number: "(202) 555-0104",
    };
    const patch = reconcileCustomerBody(q, existing);
    expect(patch).toEqual({ first_name: "Jordan", last_name: "Example" });
  });

  it("returns an empty patch when everything already matches", () => {
    const q = makeQuote();
    const existing: HcpCustomer = {
      id: "cus_x",
      first_name: "Taylor",
      last_name: "Sample",
      company: "Sample LLC",
      email: "TAYLOR@example.com", // case-insensitive
      mobile_number: "2025550102", // phone compared digits-only
    };
    expect(reconcileCustomerBody(q, existing)).toEqual({});
  });

  it("never blanks a field HCP has but the quote lacks", () => {
    const q = makeQuote({ customerCompany: null as unknown as string, customerPhone: null as unknown as string });
    const existing: HcpCustomer = {
      id: "cus_x",
      first_name: "Taylor",
      last_name: "Sample",
      company: "Existing Co",
      email: "taylor@example.com",
      mobile_number: "2025550105",
    };
    const patch = reconcileCustomerBody(q, existing);
    expect(patch).not.toHaveProperty("company");
    expect(patch).not.toHaveProperty("mobile_number");
  });
});

// ---- resolveHeadlineTier ----

describe("resolveHeadlineTier", () => {
  it("prefers the customer-selected tier", () => {
    expect(resolveHeadlineTier(makeQuote())?.key).toBe("biweekly");
  });
  it("falls back to highlighted when none selected", () => {
    expect(resolveHeadlineTier(makeQuote({ selectedTierKey: null }))?.key).toBe("biweekly");
  });
  it("falls back to first when none highlighted/selected", () => {
    const tiers = TIERS.map((t) => ({ ...t, highlighted: false }));
    const q = makeQuote({ selectedTierKey: null, computedTiers: tiers });
    expect(resolveHeadlineTier(q)?.key).toBe("weekly");
  });
});

// ---- buildEstimateBody ----

describe("buildEstimateBody", () => {
  it("creates one option per tier, each with a priced line item (so HCP totals populate)", () => {
    const body = buildEstimateBody(makeQuote(), "cust_1", "https://q/tok123");
    expect(body.customer_id).toBe("cust_1");
    const options = body.options as Array<{
      name: string;
      line_items: Array<{ name: string; unit_price: number; quantity: number }>;
    }>;
    expect(options).toHaveLength(3);
    expect(options[0].name).toBe("Weekly");
    expect(options[0].line_items).toHaveLength(1);
    expect(options[0].line_items[0]).toMatchObject({ unit_price: 40000, quantity: 1 });
    expect(options[1].name).toBe("Bi-Weekly (selected)");
    expect(options[1].line_items[0]).toMatchObject({ unit_price: 31000, quantity: 1 });
    expect(options[2].line_items[0]).toMatchObject({ unit_price: 25000, quantity: 1 });
  });
  it("does NOT send a bare total_amount (HCP would store $0)", () => {
    const body = buildEstimateBody(makeQuote(), "cust_1", "https://q/x");
    const options = body.options as Array<Record<string, unknown>>;
    expect(options[0]).not.toHaveProperty("total_amount");
  });
  it("falls back to a single placeholder option (with a line item) when no tiers", () => {
    const q = makeQuote({ computedTiers: [] });
    const options = buildEstimateBody(q, "cust_1", "https://q/x").options as Array<{
      line_items: unknown[];
    }>;
    expect(options).toHaveLength(1);
    expect(options[0].line_items).toHaveLength(1);
  });
});

// ---- mergeTag ----

describe("mergeTag", () => {
  it("adds the tag to an empty/undefined list", () => {
    expect(mergeTag(undefined, "Proposal Pro")).toEqual(["Proposal Pro"]);
    expect(mergeTag([], "Proposal Pro")).toEqual(["Proposal Pro"]);
  });
  it("appends without dropping existing tags", () => {
    expect(mergeTag(["VIP"], "Proposal Pro")).toEqual(["VIP", "Proposal Pro"]);
  });
  it("returns null (skip PUT) when the tag is already present, case-insensitively", () => {
    expect(mergeTag(["proposal pro"], "Proposal Pro")).toBeNull();
    expect(mergeTag(["Proposal Pro"], "Proposal Pro")).toBeNull();
  });
});

// ---- buildSendNote ----

describe("buildSendNote", () => {
  it("includes the quote link and the headline tier", () => {
    const note = buildSendNote(makeQuote(), "https://q/tok123");
    expect(note).toContain("https://q/tok123");
    expect(note).toContain("Proposal Pro");
    expect(note).toMatch(/Bi-Weekly/);
  });
});

// ---- buildJobBody ----

describe("buildJobBody", () => {
  it("uses the headline tier as a single line item in cents (unscheduled: no schedule)", () => {
    const body = buildJobBody(makeQuote(), "cust_1", "https://q/tok123");
    expect(body.customer_id).toBe("cust_1");
    expect(body).not.toHaveProperty("schedule");
    const items = body.line_items as Array<{ name: string; unit_price: number; quantity: number }>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "Bi-Weekly", unit_price: 31000, quantity: 1 });
  });
});

// ---- notes ----

describe("approval / decline notes", () => {
  it("approval note names the tier and price and mentions the unscheduled job", () => {
    const note = buildApprovalNote(makeQuote());
    expect(note).toContain("APPROVED");
    expect(note).toContain("Bi-Weekly");
    expect(note).toContain("$310");
    expect(note.toLowerCase()).toContain("unscheduled job");
  });
  it("decline note includes an optional reason", () => {
    expect(buildDeclineNote(makeQuote())).toContain("DECLINED");
    expect(buildDeclineNote(makeQuote(), "too expensive")).toContain("Reason: too expensive");
  });
});
