import { describe, expect, it } from "vitest";
import {
  resolveApprovalTierKey,
  webhooksForQuoteAction,
  liveStatus,
  statusChangePlan,
} from "./routers/quotes";
import { shouldFireHcp, deliveryHandledByGhl } from "./integrations";
import type { Settings } from "../drizzle/schema";

const tiers = [
  { key: "good", name: "Monthly", description: "", features: [], total: 100 },
  { key: "better", name: "Bi-Weekly", description: "", features: [], total: 150, highlighted: true },
  { key: "best", name: "Weekly", description: "", features: [], total: 200 },
];

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    id: 1,
    companyName: "Example Home Services",
    companyEmail: "hello@example.com",
    companyPhone: "(202) 555-0108",
    logoUrl: null,
    primaryColor: "#16a34a",
    accentColor: "#2563eb",
    backgroundColor: "#f7f5f0",
    textColor: "#1c1917",
    cardColor: "#ffffff",
    formHeadline: "Get Your Instant Cleaning Quote",
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

describe("resolveApprovalTierKey", () => {
  it("prefers an explicit tier key", () => {
    expect(
      resolveApprovalTierKey({ selectedTierKey: "good", computedTiers: tiers }, "best"),
    ).toBe("best");
  });

  it("falls back to the quote's existing selection", () => {
    expect(
      resolveApprovalTierKey({ selectedTierKey: "good", computedTiers: tiers }),
    ).toBe("good");
  });

  it("uses the highlighted tier when none is selected", () => {
    expect(
      resolveApprovalTierKey({ selectedTierKey: null, computedTiers: tiers }),
    ).toBe("better");
  });

  it("uses the midpoint tier when nothing is highlighted or selected", () => {
    const noHighlight = tiers.map(({ highlighted, ...t }) => t);
    expect(
      resolveApprovalTierKey({ selectedTierKey: null, computedTiers: noHighlight }),
    ).toBe("better");
  });

  it("returns null when there are no tiers", () => {
    expect(
      resolveApprovalTierKey({ selectedTierKey: null, computedTiers: [] }),
    ).toBeNull();
  });
});

describe("webhooksForQuoteAction", () => {
  it("fires accepted webhooks on approve", () => {
    expect(webhooksForQuoteAction("approve").fireAcceptedWebhooks).toBe(true);
  });

  it("never fires webhooks on decline", () => {
    expect(webhooksForQuoteAction("decline").fireAcceptedWebhooks).toBe(false);
  });
});

describe("approve/decline integration gating", () => {
  it("approve would dispatch the GHL accepted webhook when GHL is configured", () => {
    const settings = makeSettings({ ghlEnabled: true, ghlWebhookUrl: "https://hook.ghl" });
    const fire = webhooksForQuoteAction("approve").fireAcceptedWebhooks;
    expect(fire && deliveryHandledByGhl(settings)).toBe(true);
  });

  it("approve would dispatch the HCP accepted webhook when HCP accept is enabled", () => {
    const settings = makeSettings({
      hcpEnabled: true,
      hcpWebhookUrl: "https://hook.hcp",
      hcpOnAccept: true,
    });
    const fire = webhooksForQuoteAction("approve").fireAcceptedWebhooks;
    expect(fire && shouldFireHcp(settings, "quote.accepted")).toBe(true);
  });

  it("decline dispatches no webhooks even when integrations are configured", () => {
    const settings = makeSettings({
      ghlEnabled: true,
      ghlWebhookUrl: "https://hook.ghl",
      hcpEnabled: true,
      hcpWebhookUrl: "https://hook.hcp",
      hcpOnAccept: true,
    });
    const fire = webhooksForQuoteAction("decline").fireAcceptedWebhooks;
    expect(fire).toBe(false);
    // Even though the integrations are "ready", the action gate is false.
    expect(fire && deliveryHandledByGhl(settings)).toBe(false);
    expect(fire && shouldFireHcp(settings, "quote.accepted")).toBe(false);
  });
});

describe("declined status", () => {
  it("liveStatus leaves an explicitly declined quote untouched by expiry", () => {
    // declined is a terminal manual state; it should not be coerced to expired.
    expect(liveStatus({ status: "declined", expiresAt: new Date(0) })).toBe("declined");
  });
});

describe("draft status (draft -> review -> send workflow)", () => {
  it("liveStatus keeps a draft as draft, never coerced to pending", () => {
    // A freshly created internal draft has a future expiry but must stay draft.
    expect(
      liveStatus({ status: "draft", expiresAt: new Date(Date.now() + 1_000_000) }),
    ).toBe("draft");
  });

  it("liveStatus does not expire a draft even past its expiry date", () => {
    // Drafts aren't live yet, so expiry must not apply to them.
    expect(liveStatus({ status: "draft", expiresAt: new Date(0) })).toBe("draft");
  });
});

// statusChangePlan is the exact pure planner the setStatus procedure applies:
// it returns the db patch + whether CRM webhooks fire, with no IO.
describe("statusChangePlan (manual setStatus)", () => {
  it("accepted: sets acceptedAt, resolves tier, fires webhooks", () => {
    const plan = statusChangePlan({ selectedTierKey: null, computedTiers: tiers }, "accepted");
    expect(plan.patch.status).toBe("accepted");
    expect(plan.patch.acceptedAt).toBeInstanceOf(Date);
    expect(plan.patch.selectedTierKey).toBe("better"); // highlighted tier
    expect(plan.fireAcceptedWebhooks).toBe(true);
  });

  it("accepted: honors an explicit tier choice", () => {
    const plan = statusChangePlan(
      { selectedTierKey: "good", computedTiers: tiers },
      "accepted",
      "best",
    );
    expect(plan.patch.selectedTierKey).toBe("best");
    expect(plan.fireAcceptedWebhooks).toBe(true);
  });

  it("pending: clears acceptedAt and fires nothing", () => {
    const plan = statusChangePlan({ selectedTierKey: "good", computedTiers: tiers }, "pending");
    expect(plan.patch.status).toBe("pending");
    expect(plan.patch.acceptedAt).toBeNull();
    expect(plan.patch.selectedTierKey).toBeUndefined();
    expect(plan.fireAcceptedWebhooks).toBe(false);
  });

  it("declined: clears acceptedAt and fires nothing", () => {
    const plan = statusChangePlan({ selectedTierKey: "good", computedTiers: tiers }, "declined");
    expect(plan.patch.status).toBe("declined");
    expect(plan.patch.acceptedAt).toBeNull();
    expect(plan.fireAcceptedWebhooks).toBe(false);
  });

  it("expired: leaves acceptedAt untouched and fires nothing", () => {
    const plan = statusChangePlan({ selectedTierKey: "good", computedTiers: tiers }, "expired");
    expect(plan.patch.status).toBe("expired");
    expect(plan.patch.acceptedAt).toBeUndefined();
    expect(plan.fireAcceptedWebhooks).toBe(false);
  });
});
