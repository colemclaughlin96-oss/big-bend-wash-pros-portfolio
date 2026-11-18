import type { Quote, Settings } from "../drizzle/schema";

/**
 * GoHighLevel (LeadConnector) v2 API client.
 *
 * Auth model: a Location-level Private Integration token (Bearer) + Location ID.
 * Docs base: https://services.leadconnectorhq.com
 *
 * Design notes:
 * - Pure helpers (status->stage resolution, contact/opportunity payload builders)
 *   are exported separately so they can be unit-tested without network access.
 * - Async API functions never throw to the caller path that fires on quote status
 *   changes; they return a structured result so a sync failure never blocks the
 *   core quote workflow.
 */

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
export const ESTIMATE_FIELD_NAME = "Estimate Link URL";
export const ESTIMATE_FIELD_KEY = "estimate_link_url";
export const PRICE_FIELD_NAME = "Price";
export const PRICE_FIELD_KEY = "price";

export type QuoteSyncStatus = "created" | "pending" | "accepted" | "declined";

export type GhlConfig = {
  token: string;
  locationId: string;
};

export type GhlStage = { id: string; name: string };
export type GhlPipeline = { id: string; name: string; stages: GhlStage[] };

export type GhlSyncResult = { ok: boolean; status: string; detail?: string };

// ---------- Pure helpers (unit-tested) ----------

/** Whether the GHL v2 integration is configured enough to attempt a sync. */
export function ghlV2Ready(settings: Settings): boolean {
  return Boolean(
    settings.ghlV2Enabled &&
      settings.ghlApiToken &&
      settings.ghlLocationId &&
      settings.ghlPipelineId,
  );
}

/**
 * Resolve the mapped GHL pipeline stage id for a given quote status.
 * Returns null when no stage is mapped for that status (sync is skipped).
 */
export function resolveStageId(
  settings: Settings,
  status: QuoteSyncStatus,
): string | null {
  switch (status) {
    case "created":
      // New Lead: a quote has come in but has not been sent yet.
      // Fall back to the "sent" stage only if New Lead is not mapped.
      return settings.ghlStageNewLeadId || settings.ghlStageSentId || null;
    case "pending":
      return settings.ghlStageSentId || null;
    case "accepted":
      return settings.ghlStageAcceptedId || null;
    case "declined":
      return settings.ghlStageDeclinedId || null;
    default:
      return null;
  }
}

/** Split a full name into first/last for GHL contact fields. */
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || fullName || "",
    lastName: parts.slice(1).join(" "),
  };
}

/** The dollar amount used as the opportunity monetary value. */
export function quoteMonetaryValue(quote: Quote): number {
  const selected = quote.computedTiers?.find((t) => t.key === quote.selectedTierKey);
  if (selected) return selected.total;
  // Fall back to the first/cheapest tier when none selected yet.
  const first = quote.computedTiers?.[0];
  return first ? first.total : 0;
}

/**
 * Build the GHL v2 contact upsert body. The Estimate Link URL and Price are
 * written to the contact's custom fields (matching the fields shown on the
 * Contact Details screen in HighLevel) when their field ids are known.
 */
export function buildContactBody(
  quote: Quote,
  locationId: string,
  opts?: {
    quoteUrl?: string;
    estimateFieldId?: string | null;
    priceFieldId?: string | null;
  },
) {
  const { firstName, lastName } = splitName(quote.customerName || "");
  const customFields: Array<{ id: string; field_value: string }> = [];
  if (opts?.estimateFieldId && opts.quoteUrl) {
    customFields.push({ id: opts.estimateFieldId, field_value: opts.quoteUrl });
  }
  if (opts?.priceFieldId) {
    customFields.push({
      id: opts.priceFieldId,
      field_value: String(quoteMonetaryValue(quote)),
    });
  }
  return {
    locationId,
    firstName,
    lastName,
    name: quote.customerName || "",
    email: quote.customerEmail || undefined,
    phone: quote.customerPhone || undefined,
    address1: quote.propertyAddress || undefined,
    city: quote.propertyCity || undefined,
    state: quote.propertyState || undefined,
    postalCode: quote.propertyZip || undefined,
    ...(customFields.length > 0 ? { customFields } : {}),
  };
}

/**
 * Build the GHL v2 opportunity upsert body. The Estimate Link URL is sent both
 * as a custom field (when the field id is known) and the monetary value carries
 * the quote price.
 */
export function buildOpportunityBody(args: {
  quote: Quote;
  locationId: string;
  pipelineId: string;
  stageId: string;
  contactId: string;
  quoteUrl: string;
  estimateFieldId?: string | null;
}) {
  const { quote, locationId, pipelineId, stageId, contactId, quoteUrl, estimateFieldId } = args;
  const body: Record<string, unknown> = {
    locationId,
    pipelineId,
    pipelineStageId: stageId,
    contactId,
    name: `${quote.customerName || "Quote"} — Cleaning Estimate`,
    monetaryValue: quoteMonetaryValue(quote),
    status: "open",
  };
  if (estimateFieldId) {
    body.customFields = [{ id: estimateFieldId, field_value: quoteUrl }];
  }
  return body;
}

// ---------- Network layer ----------

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Version: GHL_VERSION,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * Test the connection by fetching the location. Returns ok + a human label.
 */
export async function testConnection(cfg: GhlConfig): Promise<GhlSyncResult> {
  if (!cfg.token || !cfg.locationId) {
    return { ok: false, status: "missing_config" };
  }
  try {
    const resp = await fetch(`${GHL_BASE}/locations/${cfg.locationId}`, {
      method: "GET",
      headers: headers(cfg.token),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { ok: false, status: `http_${resp.status}`, detail: text.slice(0, 300) };
    }
    const data = (await resp.json()) as { location?: { name?: string } };
    return { ok: true, status: "connected", detail: data?.location?.name || cfg.locationId };
  } catch (err) {
    return { ok: false, status: "error", detail: String(err).slice(0, 300) };
  }
}

/**
 * List pipelines (with stages) for the configured location.
 */
export async function listPipelines(cfg: GhlConfig): Promise<{
  ok: boolean;
  status: string;
  pipelines: GhlPipeline[];
  detail?: string;
}> {
  if (!cfg.token || !cfg.locationId) {
    return { ok: false, status: "missing_config", pipelines: [] };
  }
  try {
    const resp = await fetch(
      `${GHL_BASE}/opportunities/pipelines?locationId=${encodeURIComponent(cfg.locationId)}`,
      { method: "GET", headers: headers(cfg.token) },
    );
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { ok: false, status: `http_${resp.status}`, pipelines: [], detail: text.slice(0, 300) };
    }
    const data = (await resp.json()) as {
      pipelines?: Array<{ id: string; name: string; stages?: Array<{ id: string; name: string }> }>;
    };
    const pipelines: GhlPipeline[] = (data.pipelines || []).map((p) => ({
      id: p.id,
      name: p.name,
      stages: (p.stages || []).map((s) => ({ id: s.id, name: s.name })),
    }));
    return { ok: true, status: "ok", pipelines };
  } catch (err) {
    return { ok: false, status: "error", pipelines: [], detail: String(err).slice(0, 300) };
  }
}

export type FieldMatch = { name: string; keyHint: string };

export type MatchedField = { id: string; name?: string; fieldKey?: string };

/**
 * Find a contact custom field by exact name match first, then by an exact
 * fieldKey suffix match (GHL keys look like "contact.estimate_link_url").
 * Returns the full field so callers can surface what was matched.
 */
export function findField(
  fields: Array<{ id: string; name?: string; fieldKey?: string }>,
  match: FieldMatch,
): MatchedField | undefined {
  const wantName = match.name.toLowerCase();
  const wantKey = match.keyHint.toLowerCase();
  // 1) Exact name match.
  let found = fields.find((f) => f.name?.toLowerCase() === wantName);
  // 2) Exact key suffix match ("...estimate_link_url" or "...price").
  if (!found) {
    found = fields.find((f) => {
      const key = f.fieldKey?.toLowerCase() ?? "";
      return key === wantKey || key.endsWith(`.${wantKey}`) || key.endsWith(`_${wantKey}`);
    });
  }
  return found ? { id: found.id, name: found.name, fieldKey: found.fieldKey } : undefined;
}

/**
 * Resolve the CONTACT custom field ids for "Estimate Link URL" and "Price".
 * Estimate Link URL is created if missing; Price is matched only (it is often a
 * standard/native field that cannot be created as a custom field).
 */
export type ContactFieldsResult = {
  ok: boolean;
  status: string;
  estimateFieldId?: string;
  priceFieldId?: string;
  // Full metadata for what was matched, so the UI can show the exact field.
  estimateField?: MatchedField;
  priceField?: MatchedField;
  estimateCreated?: boolean;
  totalContactFields?: number;
  detail?: string;
};

export async function ensureContactFields(cfg: GhlConfig): Promise<ContactFieldsResult> {
  if (!cfg.token || !cfg.locationId) {
    return { ok: false, status: "missing_config" };
  }
  try {
    let estimateField: MatchedField | undefined;
    let priceField: MatchedField | undefined;
    let estimateCreated = false;
    let totalContactFields: number | undefined;

    const listResp = await fetch(
      `${GHL_BASE}/locations/${cfg.locationId}/customFields?model=contact`,
      { method: "GET", headers: headers(cfg.token) },
    );
    if (listResp.ok) {
      const data = (await listResp.json()) as {
        customFields?: Array<{ id: string; name?: string; fieldKey?: string }>;
      };
      const fields = data.customFields || [];
      totalContactFields = fields.length;
      estimateField = findField(fields, {
        name: ESTIMATE_FIELD_NAME,
        keyHint: ESTIMATE_FIELD_KEY,
      });
      priceField = findField(fields, { name: PRICE_FIELD_NAME, keyHint: PRICE_FIELD_KEY });
    } else {
      const text = await listResp.text().catch(() => "");
      return {
        ok: false,
        status: `list_http_${listResp.status}`,
        detail: text.slice(0, 300),
      };
    }

    // Create the Estimate Link URL contact field if it does not exist yet.
    if (!estimateField) {
      const createResp = await fetch(`${GHL_BASE}/locations/${cfg.locationId}/customFields`, {
        method: "POST",
        headers: headers(cfg.token),
        body: JSON.stringify({
          name: ESTIMATE_FIELD_NAME,
          dataType: "TEXT",
          model: "contact",
        }),
      });
      if (createResp.ok) {
        const created = (await createResp.json()) as {
          customField?: { id: string; name?: string; fieldKey?: string };
          id?: string;
        };
        const id = created?.customField?.id || created?.id;
        if (id) {
          estimateField = {
            id,
            name: created?.customField?.name ?? ESTIMATE_FIELD_NAME,
            fieldKey: created?.customField?.fieldKey,
          };
          estimateCreated = true;
        }
      }
    }

    return {
      ok: Boolean(estimateField),
      status: estimateField ? "ok" : "estimate_field_unresolved",
      estimateFieldId: estimateField?.id,
      priceFieldId: priceField?.id,
      estimateField,
      priceField,
      estimateCreated,
      totalContactFields,
    };
  } catch (err) {
    return { ok: false, status: "error", detail: String(err).slice(0, 300) };
  }
}

/**
 * Backwards-compatible wrapper retained for callers that only need the estimate
 * field id. Delegates to ensureContactFields.
 */
export async function ensureEstimateField(cfg: GhlConfig): Promise<{
  ok: boolean;
  status: string;
  fieldId?: string;
  detail?: string;
}> {
  const r = await ensureContactFields(cfg);
  return { ok: r.ok, status: r.status, fieldId: r.estimateFieldId, detail: r.detail };
}

/** Upsert a contact (with Estimate Link URL + Price custom fields) and return its id. */
async function upsertContact(
  cfg: GhlConfig,
  quote: Quote,
  opts?: { quoteUrl?: string; estimateFieldId?: string | null; priceFieldId?: string | null },
): Promise<string | null> {
  const resp = await fetch(`${GHL_BASE}/contacts/upsert`, {
    method: "POST",
    headers: headers(cfg.token),
    body: JSON.stringify(buildContactBody(quote, cfg.locationId, opts)),
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as { contact?: { id?: string }; id?: string };
  return data?.contact?.id || data?.id || null;
}

/** Upsert an opportunity (create or move to stage). */
async function upsertOpportunity(
  cfg: GhlConfig,
  body: Record<string, unknown>,
): Promise<boolean> {
  const resp = await fetch(`${GHL_BASE}/opportunities/upsert`, {
    method: "POST",
    headers: headers(cfg.token),
    body: JSON.stringify(body),
  });
  return resp.ok;
}

/**
 * Sync a quote to GHL: upsert the contact, then upsert the opportunity into the
 * stage mapped for the quote's status. Never throws — returns a structured result.
 */
export async function syncQuoteToGhl(
  quote: Quote,
  settings: Settings,
  quoteUrl: string,
  statusOverride?: QuoteSyncStatus,
): Promise<GhlSyncResult> {
  if (!ghlV2Ready(settings)) return { ok: false, status: "disabled" };

  const status = statusOverride ?? (quote.status as QuoteSyncStatus);
  const stageId = resolveStageId(settings, status);
  if (!stageId) return { ok: false, status: "no_stage_mapped" };

  const cfg: GhlConfig = {
    token: settings.ghlApiToken as string,
    locationId: settings.ghlLocationId as string,
  };

  try {
    const contactId = await upsertContact(cfg, quote, {
      quoteUrl,
      estimateFieldId: settings.ghlEstimateFieldId,
      priceFieldId: settings.ghlPriceFieldId,
    });
    if (!contactId) return { ok: false, status: "contact_failed" };

    const body = buildOpportunityBody({
      quote,
      locationId: cfg.locationId,
      pipelineId: settings.ghlPipelineId as string,
      stageId,
      contactId,
      quoteUrl,
      estimateFieldId: settings.ghlEstimateFieldId,
    });
    const ok = await upsertOpportunity(cfg, body);
    return ok ? { ok: true, status: "synced" } : { ok: false, status: "opportunity_failed" };
  } catch (err) {
    console.warn("[GHL] sync error:", err);
    return { ok: false, status: "error", detail: String(err).slice(0, 300) };
  }
}
