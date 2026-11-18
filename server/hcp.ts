import type { Quote, Settings } from "../drizzle/schema";
import { ENV } from "./_core/env";

/**
 * Housecall Pro (HCP) v2 API client.
 *
 * Auth model: `Authorization: Token <HOUSECALL_PRO_API_KEY>` (server-side env only).
 * Base: https://api.housecallpro.com
 *
 * HCP capability notes from development testing (account details omitted):
 *   - GET  /customers?q=         search by email/phone/name        ✅
 *   - POST /customers            create customer                   ✅
 *   - PUT  /customers/{id}       update customer (incl. notes)     ✅
 *   - DELETE /customers/{id}     NOT supported (404)               ❌
 *   - GET  /estimates            list/read estimates               ✅
 *   - POST /estimates            create estimate (customer_id+options[]) ✅
 *   - estimate option status writes (approve/decline) NOT supported (404) ❌
 *   - POST /jobs                 create job; omit schedule => "needs scheduling" (unscheduled) ✅
 *
 * Because HCP cannot flip an estimate to approved/declined via API, the approval
 * flow instead creates an UNSCHEDULED JOB (work_status "needs scheduling") that the
 * HCP user simply drags onto the calendar. Decline stamps a customer note only.
 *
 * Design notes:
 * - Pure helpers (matching, body builders, dollar->cents) are exported separately
 *   so they can be unit-tested without network access.
 * - All async API functions NEVER throw to the quote-flow caller; they return a
 *   structured result so a sync failure never blocks the core quote workflow.
 * - The raw API key is never logged.
 */

// ---------- Types ----------

export type HcpResult<T = unknown> = {
  ok: boolean;
  status: string; // machine-readable: synced | disabled | not_configured | http_xxx | error | no_match
  detail?: string;
  data?: T;
};

export type HcpAddress = {
  type?: string;
  street?: string;
  street_line_2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
};

export type HcpCustomer = {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string | null;
  mobile_number?: string | null;
  company?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  addresses?: HcpAddress[];
};

// ---------- Pure helpers (unit-tested) ----------

/** Whether the HCP v2 API integration is configured + enabled enough to attempt a sync. */
export function hcpV2Ready(settings: Settings): boolean {
  return Boolean(settings.hcpV2Enabled && ENV.housecallProApiKey);
}

/** Split a full name into first/last for HCP customer fields. */
export function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

/** Normalize a phone to digits-only for comparison (US-centric, tolerant). */
export function normalizePhone(phone?: string | null): string {
  return (phone || "").replace(/\D/g, "");
}

/** Dollars (e.g. 310 or 310.5) -> integer cents (31000 / 31050) HCP expects. */
export function dollarsToCents(dollars: number): number {
  return Math.round((Number(dollars) || 0) * 100);
}

/**
 * Choose the best matching HCP customer from a search result list.
 * Priority: exact email > exact phone (digits) > exact full-name (case-insensitive).
 * Returns the matched customer id or null. Also reports the basis used.
 */
export function matchCustomer(
  candidates: HcpCustomer[],
  query: { email?: string | null; phone?: string | null; name?: string | null },
): { id: string; basis: "email" | "phone" | "name" } | null {
  const email = (query.email || "").trim().toLowerCase();
  const phone = normalizePhone(query.phone);
  const name = (query.name || "").trim().toLowerCase();

  if (email) {
    const hit = candidates.find((c) => (c.email || "").trim().toLowerCase() === email);
    if (hit) return { id: hit.id, basis: "email" };
  }
  if (phone) {
    const hit = candidates.find((c) => normalizePhone(c.mobile_number) === phone);
    if (hit) return { id: hit.id, basis: "phone" };
  }
  if (name) {
    const hit = candidates.find(
      (c) => `${c.first_name || ""} ${c.last_name || ""}`.trim().toLowerCase() === name,
    );
    if (hit) return { id: hit.id, basis: "name" };
  }
  return null;
}

/** US state name -> 2-letter postal code (also accepts already-correct codes). */
const US_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

/**
 * Normalize a state value to the clean 2-letter postal code HCP requires.
 * HCP rejects anything that isn't exactly 2 letters ("State must be 2 letters").
 * Handles trailing/leading whitespace ("wa " -> "WA") and full names
 * ("Washington" -> "WA"). Returns "" when it can't produce a valid 2-letter code,
 * so the caller omits the field rather than sending an invalid one.
 */
export function normalizeState(raw?: string | null): string {
  const v = (raw || "").trim();
  if (!v) return "";
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  const mapped = US_STATES[v.toLowerCase()];
  return mapped || "";
}

/** Build the address array for an HCP customer from a quote (omits empty addresses). */
export function buildCustomerAddresses(quote: Quote): HcpAddress[] {
  const street = (quote.propertyAddress || "").trim();
  const city = (quote.propertyCity || "").trim();
  const state = normalizeState(quote.propertyState);
  const zip = (quote.propertyZip || "").trim();
  if (!street && !city && !state && !zip) return [];
  const addr: HcpAddress = { type: "service" };
  if (street) addr.street = street;
  if (city) addr.city = city;
  if (state) addr.state = state;
  if (zip) addr.zip = zip;
  return [addr];
}

/** Build the POST /customers body from a quote. */
export function buildCustomerBody(quote: Quote): Record<string, unknown> {
  const { first_name, last_name } = splitName(quote.customerName);
  // NOTE: `lead_source` is intentionally omitted. HCP validates it against the
  // account's configured lead sources and rejects unknown values with a 400
  // ("Lead source not found"), which would block customer creation entirely.
  const body: Record<string, unknown> = {
    first_name,
    last_name,
    notifications_enabled: false,
  };
  if (quote.customerEmail) body.email = quote.customerEmail;
  if (quote.customerPhone) body.mobile_number = quote.customerPhone;
  if (quote.customerCompany) body.company = quote.customerCompany;
  const addresses = buildCustomerAddresses(quote);
  if (addresses.length) body.addresses = addresses;
  return body;
}

/**
 * Build a NON-DESTRUCTIVE patch to reconcile an existing matched HCP customer
 * with the QuoteBid record (source of truth for the submitter). Only includes a
 * field when QuoteBid has a non-empty value that DIFFERS from what HCP holds.
 * Never blanks out a field HCP has but QuoteBid lacks. Returns {} when nothing
 * needs to change (so the caller can skip the PUT entirely).
 */
export function reconcileCustomerBody(
  quote: Quote,
  existing: HcpCustomer,
): Record<string, unknown> {
  const { first_name, last_name } = splitName(quote.customerName);
  const patch: Record<string, unknown> = {};
  const norm = (v?: string | null) => (v || "").trim();

  if (first_name && norm(first_name) !== norm(existing.first_name)) patch.first_name = first_name;
  if (last_name && norm(last_name) !== norm(existing.last_name)) patch.last_name = last_name;
  if (
    quote.customerCompany &&
    norm(quote.customerCompany) !== norm(existing.company)
  )
    patch.company = quote.customerCompany;
  if (
    quote.customerEmail &&
    norm(quote.customerEmail).toLowerCase() !== norm(existing.email).toLowerCase()
  )
    patch.email = quote.customerEmail;
  if (
    quote.customerPhone &&
    normalizePhone(quote.customerPhone) !== normalizePhone(existing.mobile_number)
  )
    patch.mobile_number = quote.customerPhone;
  return patch;
}

/** Resolve the headline tier for an estimate/job (customer selection > highlighted > first). */
export function resolveHeadlineTier(quote: Quote) {
  return (
    quote.computedTiers.find((t) => t.key === quote.selectedTierKey) ??
    quote.computedTiers.find((t) => t.highlighted) ??
    quote.computedTiers[0] ??
    null
  );
}

/**
 * Build the POST /estimates body: one option per QuoteBid tier, totals in cents.
 * The customer's selected tier (if any) is marked in the option name.
 */
export function buildEstimateBody(
  quote: Quote,
  customerId: string,
  quoteUrl: string,
): Record<string, unknown> {
  // IMPORTANT: an HCP estimate option's `total_amount` is DERIVED from its
  // `line_items`. Posting `total_amount` alone results in a $0 option in HCP.
  // So each tier becomes an option with a single line item priced at the tier
  // total (in cents), which makes the option total populate correctly.
  const options = quote.computedTiers.map((t) => {
    const cents = dollarsToCents(t.total);
    return {
      name: t.key === quote.selectedTierKey ? `${t.name} (selected)` : t.name,
      message_from_pro: [t.description, (t.features || []).join(", ")]
        .filter(Boolean)
        .join(" — ")
        .slice(0, 900),
      line_items: [
        {
          name: t.name,
          unit_price: cents,
          quantity: 1,
          kind: "labor",
        },
      ],
    };
  });
  return {
    customer_id: customerId,
    options: options.length
      ? options
      : [
          {
            name: "Estimate",
            message_from_pro: `QuoteBid estimate ${quoteUrl}`,
            line_items: [{ name: "Estimate", unit_price: 0, quantity: 1, kind: "labor" }],
          },
        ],
  };
}

/** The customer tag QuoteBid applies on send so HCP users can segment QuoteBid-sourced customers. */
export const HCP_CUSTOMER_TAG = "Proposal Pro";

/**
 * Merge a tag into an existing tags array without duplicating it.
 * Returns the merged array, or null when the tag is already present (so the
 * caller can skip the PUT entirely).
 */
export function mergeTag(existing: string[] | null | undefined, tag: string): string[] | null {
  const tags = Array.isArray(existing) ? existing.filter((t) => typeof t === "string") : [];
  if (tags.some((t) => t.trim().toLowerCase() === tag.trim().toLowerCase())) return null;
  return [...tags, tag];
}

/** Compose the private customer note appended on SEND, including the quote link. */
export function buildSendNote(quote: Quote, quoteUrl: string): string {
  const tier = resolveHeadlineTier(quote);
  const when = new Date().toISOString().slice(0, 10);
  const headline = tier ? ` — ${tier.name} ($${tier.total})` : "";
  return `[Proposal Pro] Estimate sent ${when}${headline}. View quote: ${quoteUrl}`;
}

/**
 * Build the POST /jobs body for an UNSCHEDULED job created on approval.
 * Omitting `schedule` yields work_status "needs scheduling" in HCP.
 */
export function buildJobBody(
  quote: Quote,
  customerId: string,
  quoteUrl: string,
): Record<string, unknown> {
  const tier = resolveHeadlineTier(quote);
  const tierName = tier?.name || "Service";
  const cents = dollarsToCents(tier?.total || 0);
  return {
    customer_id: customerId,
    description: `[QuoteBid] ${tierName} — approved estimate. ${quoteUrl}`.slice(0, 900),
    line_items: [
      {
        name: tierName,
        unit_price: cents,
        quantity: 1,
        kind: "labor",
      },
    ],
  };
}

/** Compose the customer note appended on approval. */
export function buildApprovalNote(quote: Quote): string {
  const tier = resolveHeadlineTier(quote);
  const when = new Date().toISOString().slice(0, 10);
  return `[QuoteBid] APPROVED ${when} — ${tier?.name || "Service"} ($${tier?.total ?? 0}). Unscheduled job created; drag onto calendar to schedule.`;
}

/** Compose the customer note appended on decline. */
export function buildDeclineNote(quote: Quote, reason?: string): string {
  const tier = resolveHeadlineTier(quote);
  const when = new Date().toISOString().slice(0, 10);
  const base = `[QuoteBid] DECLINED ${when} — ${tier?.name || "Service"} ($${tier?.total ?? 0}).`;
  return reason ? `${base} Reason: ${reason}` : base;
}

// ---------- Network layer (never throws) ----------

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Token ${ENV.housecallProApiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function apiUrl(path: string): string {
  return `${ENV.housecallProApiUrl.replace(/\/$/, "")}${path}`;
}

async function hcpFetch<T = unknown>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<HcpResult<T>> {
  if (!ENV.housecallProApiKey) {
    return { ok: false, status: "not_configured", detail: "Missing HOUSECALL_PRO_API_KEY" };
  }
  const { timeoutMs = 15000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(apiUrl(path), {
      ...rest,
      headers: { ...authHeaders(), ...(rest.headers || {}) },
      signal: controller.signal,
    });
    const text = await resp.text();
    let parsed: unknown = undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined; // non-JSON (e.g. HTML 404 page)
    }
    if (!resp.ok) {
      // Keep error compact; never echo the API key.
      const detail =
        parsed && typeof parsed === "object"
          ? JSON.stringify(parsed).slice(0, 300)
          : `HTTP ${resp.status}`;
      return { ok: false, status: `http_${resp.status}`, detail };
    }
    return { ok: true, status: "ok", data: parsed as T };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    return { ok: false, status: "error", detail };
  } finally {
    clearTimeout(timer);
  }
}

/** Lightweight connectivity + auth check. Reads one customer page. */
export async function testConnection(): Promise<HcpResult<{ total_items?: number }>> {
  const res = await hcpFetch<{ total_items?: number }>("/customers?page_size=1");
  if (res.ok) {
    return { ok: true, status: "synced", detail: `Connected (${res.data?.total_items ?? 0} customers)` };
  }
  return res;
}

/** Search customers by a free-text query (email, phone, or name). */
export async function searchCustomers(q: string): Promise<HcpResult<HcpCustomer[]>> {
  const res = await hcpFetch<{ customers?: HcpCustomer[] }>(
    `/customers?q=${encodeURIComponent(q)}&page_size=20`,
  );
  if (!res.ok) return { ok: false, status: res.status, detail: res.detail };
  return { ok: true, status: "ok", data: res.data?.customers ?? [] };
}

/** Create a customer; returns the created HcpCustomer. */
export async function createCustomer(body: Record<string, unknown>): Promise<HcpResult<HcpCustomer>> {
  return hcpFetch<HcpCustomer>("/customers", { method: "POST", body: JSON.stringify(body) });
}

/** Update a customer (used to append approval/decline notes). */
export async function updateCustomer(
  id: string,
  body: Record<string, unknown>,
): Promise<HcpResult<HcpCustomer>> {
  return hcpFetch<HcpCustomer>(`/customers/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/** Read a single customer (to merge notes without clobbering existing content). */
export async function getCustomer(id: string): Promise<HcpResult<HcpCustomer>> {
  return hcpFetch<HcpCustomer>(`/customers/${encodeURIComponent(id)}`);
}

/** Create an estimate under a customer. */
export async function createEstimate(body: Record<string, unknown>): Promise<HcpResult<{ id: string }>> {
  return hcpFetch<{ id: string }>("/estimates", { method: "POST", body: JSON.stringify(body) });
}

/** Create an (unscheduled) job under a customer. */
export async function createJob(body: Record<string, unknown>): Promise<HcpResult<{ id: string }>> {
  return hcpFetch<{ id: string }>("/jobs", { method: "POST", body: JSON.stringify(body) });
}

/**
 * Append a note onto a customer record without clobbering existing notes.
 * Reads current notes, prepends the new line, writes back.
 */
export async function appendCustomerNote(id: string, note: string): Promise<HcpResult<HcpCustomer>> {
  const current = await getCustomer(id);
  const existing = current.ok ? (current.data?.notes || "") : "";
  const merged = existing ? `${note}\n${existing}`.slice(0, 4000) : note;
  return updateCustomer(id, { notes: merged });
}

/**
 * Ensure a tag is present on a customer (merge, non-destructive). Reads current
 * tags, and only PUTs when the tag is missing. Best-effort; never throws.
 */
export async function tagCustomer(id: string, tag: string): Promise<HcpResult<HcpCustomer>> {
  const current = await getCustomer(id);
  const existing = current.ok ? current.data?.tags : [];
  const merged = mergeTag(existing as string[] | null | undefined, tag);
  if (!merged) return { ok: true, status: "ok", data: current.data }; // already tagged
  return updateCustomer(id, { tags: merged });
}

/**
 * Match-or-create the HCP customer for a quote.
 * Search priority is email > phone > name, then falls back to creating one.
 * Returns the HCP customer id + whether it was matched or created.
 */
export async function matchOrCreateCustomer(
  quote: Quote,
): Promise<HcpResult<{ id: string; basis: "email" | "phone" | "name" | "created" }>> {
  // Try each identifier query in priority order; HCP `q` does broad matching,
  // so we still re-rank locally via matchCustomer.
  const queries = [quote.customerEmail, quote.customerPhone, quote.customerName].filter(
    (v): v is string => Boolean(v && v.trim()),
  );

  for (const q of queries) {
    const found = await searchCustomers(q);
    if (found.ok && found.data && found.data.length) {
      const m = matchCustomer(found.data, {
        email: quote.customerEmail,
        phone: quote.customerPhone,
        name: quote.customerName,
      });
      if (m) {
        // Reconcile stale name/company/contact on the matched record so QuoteBid
        // (source of truth for the submitter) corrects records like a prior
        // "Example Services / Example Services" that should be "Jordan Example". Non-destructive.
        const matched = found.data.find((c) => c.id === m.id);
        if (matched) {
          const patch = reconcileCustomerBody(quote, matched);
          if (Object.keys(patch).length > 0) {
            await updateCustomer(m.id, patch);
          }
        }
        return { ok: true, status: "synced", data: { id: m.id, basis: m.basis } };
      }
    } else if (!found.ok && found.status !== "ok") {
      // A hard API/auth error: surface it instead of silently creating a dup.
      if (found.status.startsWith("http_4") || found.status === "not_configured") {
        return { ok: false, status: found.status, detail: found.detail };
      }
    }
  }

  // No confident match -> create.
  const created = await createCustomer(buildCustomerBody(quote));
  if (created.ok && created.data?.id) {
    return { ok: true, status: "synced", data: { id: created.data.id, basis: "created" } };
  }
  return { ok: false, status: created.status, detail: created.detail };
}

// ---------- High-level orchestration (called from the quote router) ----------

/**
 * Patch shape persisted onto the quote after any HCP sync attempt.
 * Mirrors the hcp* columns on the quotes table.
 */
export type HcpQuotePatch = {
  hcpCustomerId?: string | null;
  hcpEstimateId?: string | null;
  hcpJobId?: string | null;
  hcpSyncStatus: string; // synced | error | disabled | not_configured | skipped
  hcpSyncError: string | null;
  hcpLastSyncedAt: Date | null;
};

function disabledPatch(reason = "disabled"): HcpQuotePatch {
  return {
    hcpSyncStatus: reason,
    hcpSyncError: null,
    hcpLastSyncedAt: null,
  };
}

function errorPatch(detail?: string, carry?: Partial<HcpQuotePatch>): HcpQuotePatch {
  return {
    ...carry,
    hcpSyncStatus: "error",
    hcpSyncError: (detail || "Housecall Pro sync failed").slice(0, 1000),
    hcpLastSyncedAt: new Date(),
  };
}

/**
 * SEND/CREATE sync: ensure the customer exists in HCP, then create an estimate
 * under them (idempotent — skips estimate creation if one was already synced).
 * Returns a patch to persist on the quote. Never throws.
 */
export async function syncQuoteOnSend(
  quote: Quote,
  settings: Settings,
  quoteUrl: string,
): Promise<HcpQuotePatch> {
  if (!hcpV2Ready(settings)) return disabledPatch();

  // 1. Match or create the customer.
  const cust = await matchOrCreateCustomer(quote);
  if (!cust.ok || !cust.data) {
    console.log(
      `[HCP] send sync token=${quote.publicToken} customer=fail status=${cust.status}`,
    );
    return errorPatch(`Customer sync failed: ${cust.detail || cust.status}`, {
      hcpCustomerId: quote.hcpCustomerId ?? null,
    });
  }
  const customerId = cust.data.id;

  // 2. Create the estimate unless one already exists (idempotent).
  let estimateId = quote.hcpEstimateId ?? null;
  if (!estimateId) {
    const est = await createEstimate(buildEstimateBody(quote, customerId, quoteUrl));
    if (!est.ok || !est.data?.id) {
      console.log(
        `[HCP] send sync token=${quote.publicToken} estimate=fail status=${est.status}`,
      );
      return errorPatch(`Estimate sync failed: ${est.detail || est.status}`, {
        hcpCustomerId: customerId,
      });
    }
    estimateId = est.data.id;
  }

  // 3. Best-effort: tag the customer "Proposal Pro" and add a private note with
  //    the quote link. Neither failure should fail the overall send sync.
  await tagCustomer(customerId, HCP_CUSTOMER_TAG);
  await appendCustomerNote(customerId, buildSendNote(quote, quoteUrl));

  console.log(
    `[HCP] send sync token=${quote.publicToken} customer=${cust.data.basis} estimate=${estimateId} tag+note=done ok=true`,
  );
  return {
    hcpCustomerId: customerId,
    hcpEstimateId: estimateId,
    hcpSyncStatus: "synced",
    hcpSyncError: null,
    hcpLastSyncedAt: new Date(),
  };
}

/**
 * APPROVE sync: ensure the customer exists, create an UNSCHEDULED job
 * (work_status "needs scheduling") with the selected tier as a line item, and
 * append an approval note to the customer. Idempotent on the job. Never throws.
 */
export async function syncQuoteOnApprove(
  quote: Quote,
  settings: Settings,
  quoteUrl: string,
): Promise<HcpQuotePatch> {
  if (!hcpV2Ready(settings)) return disabledPatch();

  // Reuse stored customer id when present, else match/create.
  let customerId = quote.hcpCustomerId ?? null;
  if (!customerId) {
    const cust = await matchOrCreateCustomer(quote);
    if (!cust.ok || !cust.data) {
      return errorPatch(`Customer sync failed: ${cust.detail || cust.status}`);
    }
    customerId = cust.data.id;
  }

  // Create the unscheduled job unless one already exists (idempotent).
  let jobId = quote.hcpJobId ?? null;
  if (!jobId) {
    const job = await createJob(buildJobBody(quote, customerId, quoteUrl));
    if (!job.ok || !job.data?.id) {
      console.log(
        `[HCP] approve sync token=${quote.publicToken} job=fail status=${job.status}`,
      );
      return errorPatch(`Job sync failed: ${job.detail || job.status}`, {
        hcpCustomerId: customerId,
        hcpEstimateId: quote.hcpEstimateId ?? null,
      });
    }
    jobId = job.data.id;
  }

  // Append the approval note (best-effort; a note failure doesn't fail the sync).
  await appendCustomerNote(customerId, buildApprovalNote(quote));

  console.log(
    `[HCP] approve sync token=${quote.publicToken} job=${jobId} ok=true`,
  );
  return {
    hcpCustomerId: customerId,
    hcpEstimateId: quote.hcpEstimateId ?? null,
    hcpJobId: jobId,
    hcpSyncStatus: "synced",
    hcpSyncError: null,
    hcpLastSyncedAt: new Date(),
  };
}

/**
 * DECLINE sync: ensure the customer exists and append a decline note. No job is
 * created. Never throws.
 */
export async function syncQuoteOnDecline(
  quote: Quote,
  settings: Settings,
  reason?: string,
): Promise<HcpQuotePatch> {
  if (!hcpV2Ready(settings)) return disabledPatch();

  let customerId = quote.hcpCustomerId ?? null;
  if (!customerId) {
    const cust = await matchOrCreateCustomer(quote);
    if (!cust.ok || !cust.data) {
      return errorPatch(`Customer sync failed: ${cust.detail || cust.status}`);
    }
    customerId = cust.data.id;
  }

  const noted = await appendCustomerNote(customerId, buildDeclineNote(quote, reason));
  if (!noted.ok) {
    return errorPatch(`Decline note failed: ${noted.detail || noted.status}`, {
      hcpCustomerId: customerId,
      hcpEstimateId: quote.hcpEstimateId ?? null,
    });
  }

  console.log(`[HCP] decline sync token=${quote.publicToken} customer=${customerId} ok=true`);
  return {
    hcpCustomerId: customerId,
    hcpEstimateId: quote.hcpEstimateId ?? null,
    hcpSyncStatus: "synced",
    hcpSyncError: null,
    hcpLastSyncedAt: new Date(),
  };
}
