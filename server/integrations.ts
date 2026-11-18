import type { Quote, Settings } from "../drizzle/schema";

export type GhlResult = { ok: boolean; status: string };

/**
 * Build the JSON payload sent to GoHighLevel (or any external CRM) on quote creation.
 * Structured so GHL inbound webhook workflows can map contact + quote fields directly.
 */
export function buildGhlPayload(quote: Quote, settings: Settings, quoteUrl: string) {
  // The "headline" tier carried to the CRM: the customer's selection if any,
  // otherwise the highlighted (most popular) package.
  const selectedTier =
    quote.computedTiers.find((t) => t.key === quote.selectedTierKey) ??
    quote.computedTiers.find((t) => t.highlighted) ??
    quote.computedTiers[0] ??
    null;
  // Split a full name into first/last for GHL contact mapping.
  const nameParts = (quote.customerName || "").trim().split(/\s+/);
  const firstName = nameParts[0] || quote.customerName || "";
  const lastName = nameParts.slice(1).join(" ");

  return {
    event: "quote.created",
    source: "ProposalPro",
    contact: {
      firstName,
      lastName,
      name: quote.customerName,
      email: quote.customerEmail || "",
      phone: quote.customerPhone || "",
      address1: quote.propertyAddress || "",
      city: quote.propertyCity || "",
      state: quote.propertyState || "",
      postalCode: quote.propertyZip || "",
      // Per integration spec: headline price -> contact.price,
      // estimate link -> custom field "estimate link URL".
      price: selectedTier?.total ?? null,
      estimateLinkUrl: quoteUrl,
    },
    quote: {
      id: quote.id,
      token: quote.publicToken,
      url: quoteUrl,
      status: quote.status,
      bedrooms: quote.bedrooms ?? null,
      bathrooms: quote.bathrooms ?? null,
      tiers: quote.computedTiers.map((t) => ({
        key: t.key,
        name: t.name,
        total: t.total,
      })),
      selectedTier: selectedTier
        ? { key: selectedTier.key, name: selectedTier.name, total: selectedTier.total }
        : null,
      expiresAt: quote.expiresAt,
      createdAt: quote.createdAt,
    },
    company: {
      name: settings.companyName,
      email: settings.companyEmail || "",
      phone: settings.companyPhone || "",
    },
  };
}

/**
 * Fire the GHL webhook. Returns a result object; never throws so quote creation
 * is never blocked by an integration failure. Per requirement, this is called on
 * EVERY new quote generation (when a webhook URL is configured + enabled).
 */
export async function fireGhlWebhook(
  quote: Quote,
  settings: Settings,
  quoteUrl: string,
): Promise<GhlResult> {
  if (!settings.ghlEnabled || !settings.ghlWebhookUrl) {
    return { ok: false, status: "disabled" };
  }
  const payload = buildGhlPayload(quote, settings, quoteUrl);
  try {
    const resp = await fetch(settings.ghlWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      return { ok: false, status: `http_${resp.status}` };
    }
    return { ok: true, status: "sent" };
  } catch (err) {
    console.warn("[GHL] Webhook error:", err);
    return { ok: false, status: "error" };
  }
}

/**
 * Email / SMS delivery abstraction.
 *
 * The platform has no built-in transactional email/SMS provider, and the
 * recommended zero-cost path is to let GHL send messages via the webhook
 * workflow. These helpers therefore "stage" delivery: they record intent and
 * return success when GHL is the configured channel, or when an external
 * provider key is present they can be extended to call it directly.
 *
 * They are intentionally side-effect-light and return a boolean so callers can
 * timestamp the quote's emailSentAt / smsSentAt fields.
 */
export type DeliveryChannel = "email" | "sms";

export function canDeliver(channel: DeliveryChannel, quote: Quote): boolean {
  if (channel === "email") return Boolean(quote.customerEmail);
  return Boolean(quote.customerPhone);
}

/**
 * Returns whether delivery is considered handled. When GHL is enabled, the
 * webhook (fired separately on creation) carries the contact + link, so GHL
 * workflows perform the actual send — we treat that as the delivery channel.
 */
export function deliveryHandledByGhl(settings: Settings): boolean {
  return settings.ghlEnabled && Boolean(settings.ghlWebhookUrl);
}


// ---- Housecall Pro integration (webhook) ----

export type HcpEvent = "quote.created" | "quote.accepted";
export type HcpResult = { ok: boolean; status: string };

/**
 * Build the JSON payload sent to Housecall Pro (via a webhook / automation).
 * Structured so an HCP inbound automation (or Zapier/Make bridge) can map a
 * customer + estimate directly. `event` distinguishes a new quote from an
 * accepted one so the automation can create vs. update accordingly.
 */
export function buildHcpPayload(
  quote: Quote,
  settings: Settings,
  quoteUrl: string,
  event: HcpEvent,
) {
  const selectedTier = quote.computedTiers.find((t) => t.key === quote.selectedTierKey);
  const nameParts = (quote.customerName || "").trim().split(/\s+/);
  const firstName = nameParts[0] || quote.customerName || "";
  const lastName = nameParts.slice(1).join(" ");

  return {
    event,
    source: "ProposalPro",
    customer: {
      first_name: firstName,
      last_name: lastName,
      name: quote.customerName,
      email: quote.customerEmail || "",
      mobile_number: quote.customerPhone || "",
      company: quote.customerCompany || "",
      address: {
        street: quote.propertyAddress || "",
        city: quote.propertyCity || "",
        state: quote.propertyState || "",
        zip: quote.propertyZip || "",
      },
    },
    estimate: {
      id: quote.id,
      token: quote.publicToken,
      url: quoteUrl,
      status: quote.status,
      bedrooms: quote.bedrooms ?? null,
      bathrooms: quote.bathrooms ?? null,
      options: quote.computedTiers.map((t) => ({
        key: t.key,
        name: t.name,
        total: t.total,
      })),
      selected_option: selectedTier
        ? { key: selectedTier.key, name: selectedTier.name, total: selectedTier.total }
        : null,
      expires_at: quote.expiresAt,
      created_at: quote.createdAt,
    },
    company: {
      name: settings.companyName,
      email: settings.companyEmail || "",
      phone: settings.companyPhone || "",
    },
  };
}

/**
 * Returns whether the Housecall Pro webhook should fire for a given event,
 * based on enablement, configured URL, and the per-event toggles.
 */
export function shouldFireHcp(settings: Settings, event: HcpEvent): boolean {
  if (!settings.hcpEnabled || !settings.hcpWebhookUrl) return false;
  if (event === "quote.created") return settings.hcpOnCreate;
  if (event === "quote.accepted") return settings.hcpOnAccept;
  return false;
}

/**
 * Fire the Housecall Pro webhook. Never throws so quote creation/acceptance is
 * never blocked by an integration failure.
 */
export async function fireHcpWebhook(
  quote: Quote,
  settings: Settings,
  quoteUrl: string,
  event: HcpEvent,
): Promise<HcpResult> {
  if (!shouldFireHcp(settings, event)) {
    return { ok: false, status: "disabled" };
  }
  const payload = buildHcpPayload(quote, settings, quoteUrl, event);
  try {
    const resp = await fetch(settings.hcpWebhookUrl as string, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      return { ok: false, status: `http_${resp.status}` };
    }
    return { ok: true, status: "sent" };
  } catch (err) {
    console.warn("[HCP] Webhook error:", err);
    return { ok: false, status: "error" };
  }
}
