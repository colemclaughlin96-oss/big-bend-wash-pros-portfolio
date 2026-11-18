import { describe, it, expect } from "vitest";
import {
  ghlV2Ready,
  resolveStageId,
  splitName,
  quoteMonetaryValue,
  buildContactBody,
  buildOpportunityBody,
  findField,
  ESTIMATE_FIELD_NAME,
  ESTIMATE_FIELD_KEY,
  PRICE_FIELD_NAME,
  PRICE_FIELD_KEY,
} from "./ghl";
import type { Quote, Settings } from "../drizzle/schema";

// Minimal settings factory for the pure helpers under test.
function makeSettings(over: Partial<Settings> = {}): Settings {
  return {
    ghlV2Enabled: true,
    ghlApiToken: "pit-token",
    ghlLocationId: "loc-1",
    ghlPipelineId: "pipe-1",
    ghlStageSentId: "stage-sent",
    ghlStageAcceptedId: "stage-accepted",
    ghlStageDeclinedId: "stage-declined",
    ghlEstimateFieldId: "field-est",
    ...over,
  } as unknown as Settings;
}

function makeQuote(over: Partial<Quote> = {}): Quote {
  return {
    customerName: "Jane Doe",
    customerEmail: "jane@example.com",
    customerPhone: "2025550101",
    propertyAddress: "123 Example St",
    propertyCity: "Example City",
    propertyState: "CO",
    propertyZip: "80503",
    selectedTierKey: "biweekly",
    computedTiers: [
      { key: "deep", name: "Initial Deep Clean", total: 528 },
      { key: "biweekly", name: "Bi-Weekly", total: 217.25 },
    ],
    status: "pending",
    ...over,
  } as unknown as Quote;
}

describe("ghlV2Ready", () => {
  it("is true when token, location, pipeline + enabled", () => {
    expect(ghlV2Ready(makeSettings())).toBe(true);
  });
  it("is false when disabled", () => {
    expect(ghlV2Ready(makeSettings({ ghlV2Enabled: false }))).toBe(false);
  });
  it("is false when missing token", () => {
    expect(ghlV2Ready(makeSettings({ ghlApiToken: null }))).toBe(false);
  });
  it("is false when missing pipeline", () => {
    expect(ghlV2Ready(makeSettings({ ghlPipelineId: null }))).toBe(false);
  });
});

describe("resolveStageId", () => {
  const s = makeSettings();
  it("maps pending -> sent stage", () => {
    expect(resolveStageId(s, "pending")).toBe("stage-sent");
  });
  it("maps accepted -> accepted stage", () => {
    expect(resolveStageId(s, "accepted")).toBe("stage-accepted");
  });
  it("maps declined -> declined stage", () => {
    expect(resolveStageId(s, "declined")).toBe("stage-declined");
  });
  it("returns null when a status has no mapped stage", () => {
    expect(resolveStageId(makeSettings({ ghlStageDeclinedId: null }), "declined")).toBeNull();
  });
  it("maps created -> New Lead stage when mapped", () => {
    expect(
      resolveStageId(makeSettings({ ghlStageNewLeadId: "stage-newlead" } as Partial<Settings>), "created"),
    ).toBe("stage-newlead");
  });
  it("created falls back to the sent stage when New Lead is not mapped", () => {
    // Option A: QuoteBid leaves New Lead unmapped, so 'created' should not break.
    expect(resolveStageId(s, "created")).toBe("stage-sent");
  });
});

describe("splitName", () => {
  it("splits first and last", () => {
    expect(splitName("Jane Doe")).toEqual({ firstName: "Jane", lastName: "Doe" });
  });
  it("handles multi-word last names", () => {
    expect(splitName("Anne Marie Copley")).toEqual({
      firstName: "Anne",
      lastName: "Marie Copley",
    });
  });
  it("handles a single token", () => {
    expect(splitName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
  });
});

describe("quoteMonetaryValue", () => {
  it("uses the selected tier total", () => {
    expect(quoteMonetaryValue(makeQuote())).toBe(217.25);
  });
  it("falls back to the first tier when none selected", () => {
    expect(quoteMonetaryValue(makeQuote({ selectedTierKey: null }))).toBe(528);
  });
  it("is 0 when there are no tiers", () => {
    expect(quoteMonetaryValue(makeQuote({ computedTiers: [] }))).toBe(0);
  });
});

describe("findField (contact custom field matching)", () => {
  const estimate = { name: ESTIMATE_FIELD_NAME, keyHint: ESTIMATE_FIELD_KEY };
  const price = { name: PRICE_FIELD_NAME, keyHint: PRICE_FIELD_KEY };

  it("matches the GHL estimate field by its contact.* key", () => {
    const fields = [
      { id: "f1", name: "Something Else", fieldKey: "contact.something" },
      { id: "f2", name: "Estimate", fieldKey: "contact.estimate_link_url" },
    ];
    expect(findField(fields, estimate)?.id).toBe("f2");
  });

  it("matches by exact name first", () => {
    const fields = [{ id: "f9", name: "Estimate Link URL", fieldKey: "contact.x" }];
    expect(findField(fields, estimate)?.id).toBe("f9");
  });

  it("matches the Price field by contact.price key", () => {
    const fields = [{ id: "p1", name: "Quote Price", fieldKey: "contact.price" }];
    expect(findField(fields, price)?.id).toBe("p1");
  });

  it("does NOT loosely match an unrelated field containing 'price'", () => {
    const fields = [{ id: "x1", name: "Price Range Preference", fieldKey: "contact.price_range" }];
    expect(findField(fields, price)).toBeUndefined();
  });

  it("returns undefined when nothing matches", () => {
    const fields = [{ id: "z", name: "Nope", fieldKey: "contact.nope" }];
    expect(findField(fields, estimate)).toBeUndefined();
  });
});

describe("buildContactBody", () => {
  it("includes name parts + address fields", () => {
    const body = buildContactBody(makeQuote(), "loc-1");
    expect(body).toMatchObject({
      locationId: "loc-1",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phone: "2025550101",
      address1: "123 Example St",
      city: "Example City",
      state: "CO",
      postalCode: "80503",
    });
  });

  it("omits customFields when no field ids are provided", () => {
    const body = buildContactBody(makeQuote(), "loc-1");
    expect((body as { customFields?: unknown }).customFields).toBeUndefined();
  });

  it("writes Estimate Link URL + Price to the contact custom fields", () => {
    const body = buildContactBody(makeQuote(), "loc-1", {
      quoteUrl: "https://quotebid.example/quote/abc",
      estimateFieldId: "field-est",
      priceFieldId: "field-price",
    });
    expect((body as { customFields: Array<{ id: string; field_value: string }> }).customFields).toEqual([
      { id: "field-est", field_value: "https://quotebid.example/quote/abc" },
      { id: "field-price", field_value: "217.25" },
    ]);
  });

  it("includes Price even when the estimate field is unknown", () => {
    const body = buildContactBody(makeQuote(), "loc-1", {
      quoteUrl: "https://quotebid.example/quote/abc",
      estimateFieldId: null,
      priceFieldId: "field-price",
    });
    expect((body as { customFields: Array<{ id: string; field_value: string }> }).customFields).toEqual([
      { id: "field-price", field_value: "217.25" },
    ]);
  });
});

describe("buildOpportunityBody", () => {
  it("sets stage, monetary value, and the Estimate Link custom field", () => {
    const body = buildOpportunityBody({
      quote: makeQuote(),
      locationId: "loc-1",
      pipelineId: "pipe-1",
      stageId: "stage-accepted",
      contactId: "contact-9",
      quoteUrl: "https://quotebid.example/quote/abc",
      estimateFieldId: "field-est",
    });
    expect(body).toMatchObject({
      locationId: "loc-1",
      pipelineId: "pipe-1",
      pipelineStageId: "stage-accepted",
      contactId: "contact-9",
      monetaryValue: 217.25,
      status: "open",
    });
    expect(body.customFields).toEqual([
      { id: "field-est", field_value: "https://quotebid.example/quote/abc" },
    ]);
  });

  it("omits customFields when no field id is known", () => {
    const body = buildOpportunityBody({
      quote: makeQuote(),
      locationId: "loc-1",
      pipelineId: "pipe-1",
      stageId: "stage-sent",
      contactId: "contact-9",
      quoteUrl: "https://quotebid.example/quote/abc",
      estimateFieldId: null,
    });
    expect(body.customFields).toBeUndefined();
  });
});
