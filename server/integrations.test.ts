import { describe, expect, it } from "vitest";
import {
  buildGhlPayload,
  canDeliver,
  deliveryHandledByGhl,
  buildHcpPayload,
  shouldFireHcp,
} from "./integrations";
import { liveStatus, buildBrandSnapshot } from "./routers/quotes";
import type { Quote, Settings } from "../drizzle/schema";

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 1,
    publicToken: "tok123",
    customerName: "Jane Doe",
    customerEmail: "jane@example.com",
    customerPhone: "(202) 555-0100",
    propertyAddress: "123 Main St",
    propertyCity: "Austin",
    propertyState: "TX",
    propertyZip: "78701",
    serviceSelections: [
      { serviceId: 1, name: "Window Cleaning", variableLabel: "Windows", variableValue: 20, base: 169 },
    ],
    computedTiers: [
      { key: "good", name: "Essential", description: "", features: [], total: 169 },
      { key: "better", name: "Preferred", description: "", features: [], total: 219.7 },
    ],
    brandSnapshot: {
      companyName: "Example Home Services",
      logoUrl: null,
      primaryColor: "#0f4c5c",
      accentColor: "#e9b949",
      companyEmail: "hello@example.com",
      companyPhone: "(202) 555-0107",
    },
    selectedTierKey: null,
    status: "pending",
    emailSentAt: null,
    smsSentAt: null,
    ghlSyncedAt: null,
    ghlStatus: null,
    acceptedAt: null,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Quote;
}

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    id: 1,
    companyName: "Example Home Services",
    companyEmail: "hello@example.com",
    companyPhone: "(202) 555-0107",
    logoUrl: null,
    primaryColor: "#0f4c5c",
    accentColor: "#e9b949",
    backgroundColor: "#f7f5f0",
    textColor: "#1c1917",
    cardColor: "#ffffff",
    formHeadline: "Get Your Instant Quote",
    formSubheadline: null,
    quoteExpiryDays: 30,
    tiers: [],
    ghlWebhookUrl: null,
    ghlEnabled: false,
    hcpWebhookUrl: null,
    hcpEnabled: false,
    hcpOnCreate: true,
    hcpOnAccept: true,
    autoDeliverEmail: false,
    autoDeliverSms: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Settings;
}

describe("buildGhlPayload", () => {
  it("splits the customer name into first/last and maps contact + quote", () => {
    const quote = makeQuote({ selectedTierKey: "better" });
    const payload = buildGhlPayload(quote, makeSettings(), "https://app.test/quote/tok123");
    expect(payload.event).toBe("quote.created");
    expect(payload.contact.firstName).toBe("Jane");
    expect(payload.contact.lastName).toBe("Doe");
    expect(payload.contact.email).toBe("jane@example.com");
    expect(payload.contact.postalCode).toBe("78701");
    expect(payload.quote.url).toBe("https://app.test/quote/tok123");
    expect(payload.quote.selectedTier).toEqual({ key: "better", name: "Preferred", total: 219.7 });
  });

  it("handles single-word names without crashing", () => {
    const payload = buildGhlPayload(makeQuote({ customerName: "Cher" }), makeSettings(), "url");
    expect(payload.contact.firstName).toBe("Cher");
    expect(payload.contact.lastName).toBe("");
  });
});

describe("delivery helpers", () => {
  it("canDeliver checks the right field", () => {
    expect(canDeliver("email", makeQuote())).toBe(true);
    expect(canDeliver("email", makeQuote({ customerEmail: null }))).toBe(false);
    expect(canDeliver("sms", makeQuote({ customerPhone: null }))).toBe(false);
  });

  it("deliveryHandledByGhl requires both enabled + url", () => {
    expect(deliveryHandledByGhl(makeSettings())).toBe(false);
    expect(deliveryHandledByGhl(makeSettings({ ghlEnabled: true }))).toBe(false);
    expect(
      deliveryHandledByGhl(makeSettings({ ghlEnabled: true, ghlWebhookUrl: "https://x" })),
    ).toBe(true);
  });
});

describe("buildHcpPayload", () => {
  it("maps customer + estimate into the Housecall Pro shape", () => {
    const quote = makeQuote({ selectedTierKey: "better", customerCompany: "Acme LLC" } as Partial<Quote>);
    const payload = buildHcpPayload(quote, makeSettings(), "https://app.test/quote/tok123", "quote.created");
    expect(payload.event).toBe("quote.created");
    expect(payload.source).toBe("ProposalPro");
    expect(payload.customer.first_name).toBe("Jane");
    expect(payload.customer.last_name).toBe("Doe");
    expect(payload.customer.email).toBe("jane@example.com");
    expect(payload.customer.address.zip).toBe("78701");
    expect(payload.estimate.url).toBe("https://app.test/quote/tok123");
    expect(payload.estimate.selected_option).toEqual({ key: "better", name: "Preferred", total: 219.7 });
  });

  it("carries the accepted event through", () => {
    const payload = buildHcpPayload(makeQuote(), makeSettings(), "url", "quote.accepted");
    expect(payload.event).toBe("quote.accepted");
    expect(payload.estimate.selected_option).toBeNull();
  });
});

describe("shouldFireHcp", () => {
  it("requires enabled + url", () => {
    expect(shouldFireHcp(makeSettings(), "quote.created")).toBe(false);
    expect(shouldFireHcp(makeSettings({ hcpEnabled: true }), "quote.created")).toBe(false);
    expect(
      shouldFireHcp(makeSettings({ hcpEnabled: true, hcpWebhookUrl: "https://x" }), "quote.created"),
    ).toBe(true);
  });

  it("respects per-event toggles", () => {
    const base = { hcpEnabled: true, hcpWebhookUrl: "https://x" };
    expect(shouldFireHcp(makeSettings({ ...base, hcpOnCreate: false }), "quote.created")).toBe(false);
    expect(shouldFireHcp(makeSettings({ ...base, hcpOnCreate: false }), "quote.accepted")).toBe(true);
    expect(shouldFireHcp(makeSettings({ ...base, hcpOnAccept: false }), "quote.accepted")).toBe(false);
  });
});

describe("buildBrandSnapshot", () => {
  it("carries the full color palette into the quote snapshot", () => {
    const snap = buildBrandSnapshot(
      makeSettings({
        primaryColor: "#123456",
        accentColor: "#abcdef",
        backgroundColor: "#0f172a",
        textColor: "#e2e8f0",
        cardColor: "#1e293b",
      }),
    );
    expect(snap.primaryColor).toBe("#123456");
    expect(snap.accentColor).toBe("#abcdef");
    expect(snap.backgroundColor).toBe("#0f172a");
    expect(snap.textColor).toBe("#e2e8f0");
    expect(snap.cardColor).toBe("#1e293b");
  });
});

describe("liveStatus", () => {
  it("keeps accepted quotes accepted", () => {
    expect(liveStatus({ status: "accepted", expiresAt: new Date(0) })).toBe("accepted");
  });

  it("marks past-expiry pending quotes as expired", () => {
    expect(liveStatus({ status: "pending", expiresAt: new Date(Date.now() - 1000) })).toBe(
      "expired",
    );
  });

  it("keeps valid pending quotes pending", () => {
    expect(liveStatus({ status: "pending", expiresAt: new Date(Date.now() + 100000) })).toBe(
      "pending",
    );
  });
});
