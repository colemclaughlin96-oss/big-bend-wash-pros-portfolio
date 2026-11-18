import { z } from "zod";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  createQuote,
  getOrCreateSettings,
  updateSettings,
  getQuoteByToken,
  getQuoteById,
  listQuotes,
  updateQuote,
  upsertCustomerFromQuote,
  listCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  listQuotesByCustomer,
} from "../db";
import { computeTiers } from "../../shared/pricing";
import { buildReports } from "../../shared/reports";
import type { Quote } from "../../drizzle/schema";
import {
  canDeliver,
  deliveryHandledByGhl,
  fireGhlWebhook,
  fireHcpWebhook,
} from "../integrations";
import { syncQuoteToGhl, ghlV2Ready } from "../ghl";
import {
  hcpV2Ready,
  syncQuoteOnSend,
  syncQuoteOnApprove,
  syncQuoteOnDecline,
} from "../hcp";
import { notifyOwner } from "../_core/notification";

// Derive the live status: a pending quote past its expiry reads as "expired".
// Accepted quotes stay accepted. This avoids needing a scheduled job.
export function liveStatus(quote: Pick<Quote, "status" | "expiresAt">): Quote["status"] {
  // Drafts are not yet live: never auto-expire or coerce them to pending.
  if (quote.status === "draft") return "draft";
  if (quote.status === "accepted") return "accepted";
  if (quote.status === "declined") return "declined";
  if (quote.status === "expired") return "expired";
  if (quote.expiresAt && new Date(quote.expiresAt).getTime() < Date.now()) return "expired";
  return "pending";
}

function withLiveStatus<T extends Pick<Quote, "status" | "expiresAt">>(quote: T): T {
  return { ...quote, status: liveStatus(quote) };
}

// Build an absolute public quote URL from a stored base + token. Falls back to a
// relative path when no base URL has been captured yet (still valid in-app).
export function absoluteQuoteUrl(baseUrl: string | null | undefined, token: string): string {
  const path = `/quote/${token}`;
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

// Snapshot the branding onto the quote so a quote always renders with the
// colors/logo that were live at the time it was created (sellable per-tenant).
export function buildBrandSnapshot(settings: {
  companyName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  cardColor: string;
  companyEmail: string | null;
  companyPhone: string | null;
}) {
  return {
    companyName: settings.companyName,
    logoUrl: settings.logoUrl,
    primaryColor: settings.primaryColor,
    accentColor: settings.accentColor,
    backgroundColor: settings.backgroundColor,
    textColor: settings.textColor,
    cardColor: settings.cardColor,
    companyEmail: settings.companyEmail,
    companyPhone: settings.companyPhone,
  };
}

// Resolve which tier an approved quote should land on: an explicit choice,
// the quote's existing selection, then the highlighted/midpoint tier.
export function resolveApprovalTierKey(
  quote: Pick<Quote, "selectedTierKey" | "computedTiers">,
  explicitTierKey?: string,
): string | null {
  let tierKey = explicitTierKey || quote.selectedTierKey || null;
  if (!tierKey && quote.computedTiers.length > 0) {
    const highlighted = quote.computedTiers.find((t) => t.highlighted);
    tierKey =
      highlighted?.key ??
      quote.computedTiers[Math.floor(quote.computedTiers.length / 2)].key;
  }
  return tierKey;
}

// Decide which integration webhooks should fire for a quote status action.
// Approve mirrors an accepted quote (fire CRM webhooks); decline fires none.
export function webhooksForQuoteAction(
  action: "approve" | "decline",
): { fireAcceptedWebhooks: boolean } {
  return { fireAcceptedWebhooks: action === "approve" };
}

// Pure planner for a manual status change (the 3-option dropdown). Decides the
// db patch and whether CRM webhooks should fire, without doing any IO. This is
// what the setStatus procedure applies, and is unit-tested directly.
export type ManualStatus = "pending" | "accepted" | "declined" | "expired";
export function statusChangePlan(
  quote: Pick<Quote, "selectedTierKey" | "computedTiers">,
  status: ManualStatus,
  explicitTierKey?: string,
): {
  patch: {
    status: ManualStatus;
    acceptedAt: Date | null | undefined;
    declinedAt: Date | null | undefined;
    selectedTierKey?: string | null;
  };
  fireAcceptedWebhooks: boolean;
} {
  const patch: {
    status: ManualStatus;
    acceptedAt: Date | null | undefined;
    declinedAt: Date | null | undefined;
    selectedTierKey?: string | null;
  } = { status, acceptedAt: undefined, declinedAt: undefined };

  if (status === "accepted") {
    patch.acceptedAt = new Date();
    patch.declinedAt = null;
    patch.selectedTierKey = resolveApprovalTierKey(quote, explicitTierKey);
  } else if (status === "declined") {
    patch.acceptedAt = null;
    patch.declinedAt = new Date();
  } else if (status === "pending") {
    patch.acceptedAt = null;
    patch.declinedAt = null;
  }

  // Only the accepted transition mirrors approve and fires CRM webhooks.
  const fireAcceptedWebhooks =
    status === "accepted" && webhooksForQuoteAction("approve").fireAcceptedWebhooks;

  return { patch, fireAcceptedWebhooks };
}

// Informational intake fields shared by public + internal quote creation.
// These are captured for the CRM/handoff but do NOT affect pricing math.
const intakeShape = {
  customerCompany: z.string().optional(),
  customerAltPhone: z.string().optional(),
  okToText: z.boolean().optional(),
  leadSource: z.string().optional(),
  projectType: z.enum(["residential", "commercial"]).optional(),
  floors: z.string().optional(),
  discountGroup: z.string().optional(),
  squareFeetActual: z.string().optional(),
  squareFeetEstimate: z.string().optional(),
  basement: z.boolean().optional(),
};

export function intakeQuoteFields(input: {
  customerCompany?: string;
  customerAltPhone?: string;
  okToText?: boolean;
  leadSource?: string;
  projectType?: "residential" | "commercial";
  floors?: string;
  discountGroup?: string;
  squareFeetActual?: string;
  squareFeetEstimate?: string;
  basement?: boolean;
}) {
  return {
    customerCompany: input.customerCompany || null,
    customerAltPhone: input.customerAltPhone || null,
    okToText: input.okToText ?? null,
    leadSource: input.leadSource || null,
    projectType: input.projectType ?? null,
    floors: input.floors || null,
    discountGroup: input.discountGroup || null,
    squareFeetActual: input.squareFeetActual || null,
    squareFeetEstimate: input.squareFeetEstimate || null,
    basement: input.basement ?? null,
  };
}

export const quotesRouter = router({
  // ---- Public: customer submits the form, we compute + persist + fire webhook ----
  create: publicProcedure
    .input(
      z.object({
        customerName: z.string().min(1),
        customerEmail: z.string().email().or(z.literal("")).optional(),
        customerPhone: z.string().optional(),
        propertyAddress: z.string().optional(),
        propertyCity: z.string().optional(),
        propertyState: z.string().optional(),
        propertyZip: z.string().optional(),
        ...intakeShape,
        bedrooms: z.number().int().min(0),
        bathrooms: z.number().int().min(0),
        origin: z.string().url(),
      }),
    )
    .mutation(async ({ input }) => {
      const settings = await getOrCreateSettings();

      const computedTiers = computeTiers(settings.tiers, {
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
      });
      // Snapshot the pricing inputs into the legacy serviceSelections column.
      const serviceSelections = [{ bedrooms: input.bedrooms, bathrooms: input.bathrooms }];

      const expiresAt = new Date(Date.now() + settings.quoteExpiryDays * 24 * 60 * 60 * 1000);
      const token = nanoid(16);

      const customer = await upsertCustomerFromQuote({
        name: input.customerName,
        company: input.customerCompany || null,
        email: input.customerEmail || null,
        phone: input.customerPhone || null,
        altPhone: input.customerAltPhone || null,
        okToText: input.okToText ?? null,
        address: input.propertyAddress || null,
        city: input.propertyCity || null,
        state: input.propertyState || null,
        zip: input.propertyZip || null,
        leadSource: input.leadSource || null,
      });

      const quote = await createQuote({
        publicToken: token,
        customerId: customer.id,
        source: "public",
        customerName: input.customerName,
        customerEmail: input.customerEmail || null,
        customerPhone: input.customerPhone || null,
        propertyAddress: input.propertyAddress || null,
        propertyCity: input.propertyCity || null,
        propertyState: input.propertyState || null,
        propertyZip: input.propertyZip || null,
        ...intakeQuoteFields(input),
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        serviceSelections,
        computedTiers,
        brandSnapshot: buildBrandSnapshot(settings),
        status: "pending",
        expiresAt,
      });

      const quoteUrl = `${input.origin}/quote/${token}`;

      // Capture the canonical app base URL once so status-change syncs (which have
      // no request origin) can build absolute CRM links later.
      if (input.origin && !settings.appBaseUrl) {
        updateSettings({ appBaseUrl: input.origin }).catch(() => {});
      }

      // GHL sync: prefer the v2 guided integration (pipeline stage); fall back to
      // the legacy raw webhook when v2 isn't configured.
      const ghl = ghlV2Ready(settings)
        ? await syncQuoteToGhl(quote, settings, quoteUrl)
        : await fireGhlWebhook(quote, settings, quoteUrl);
      const patch: Record<string, unknown> = {
        ghlSyncedAt: ghl.ok ? new Date() : null,
        ghlStatus: ghl.status,
      };

      // Fire Housecall Pro webhook on create (best-effort, gated by toggles).
      fireHcpWebhook(quote, settings, quoteUrl, "quote.created").catch(() => {});

      // Housecall Pro v2 API: match/create the customer + create the estimate.
      // Awaited so we can persist the sync result; never blocks the quote flow.
      if (hcpV2Ready(settings)) {
        const hcp = await syncQuoteOnSend(quote, settings, quoteUrl);
        Object.assign(patch, hcp);
      }

      // Auto-delivery: if GHL handles messaging, mark channels as dispatched.
      const now = new Date();
      if (deliveryHandledByGhl(settings)) {
        if (settings.autoDeliverEmail && canDeliver("email", quote)) patch.emailSentAt = now;
        if (settings.autoDeliverSms && canDeliver("sms", quote)) patch.smsSentAt = now;
      }

      const finalQuote = await updateQuote(quote.id, patch);

      // Notify the project owner of the new lead (best-effort).
      notifyOwner({
        title: `New quote: ${quote.customerName}`,
        content: `A new quote was generated for ${quote.customerName}. View: ${quoteUrl}`,
      }).catch(() => {});

      return { token: finalQuote.publicToken, url: quoteUrl };
    }),

  // ---- Public: fetch a quote by its share token (status computed live) ----
  getByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const quote = await getQuoteByToken(input.token);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" });
      // Record the first time the customer opens their proposal (best-effort,
      // non-blocking). Only set once so the timeline shows the original view.
      if (!quote.viewedAt) {
        updateQuote(quote.id, { viewedAt: new Date() }).catch(() => {});
      }
      return withLiveStatus(quote);
    }),

  // ---- Public: customer accepts a tier ----
  accept: publicProcedure
    .input(
      z.object({
        token: z.string(),
        tierKey: z.string(),
        signature: z.string().trim().min(1).max(200).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const quote = await getQuoteByToken(input.token);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" });
      if (liveStatus(quote) === "expired") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This quote has expired" });
      }
      const tier = quote.computedTiers.find((t) => t.key === input.tierKey);
      if (!tier) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid tier" });

      const now = new Date();
      const updated = await updateQuote(quote.id, {
        status: "accepted",
        selectedTierKey: input.tierKey,
        acceptedAt: now,
        declinedAt: null,
        viewedAt: quote.viewedAt ?? now,
        ...(input.signature
          ? { signature: input.signature, signedAt: now }
          : {}),
      });

      // Notify owner of acceptance.
      notifyOwner({
        title: `Quote accepted: ${quote.customerName}`,
        content: `${quote.customerName} accepted the "${tier.name}" tier ($${tier.total}).`,
      }).catch(() => {});

      // Move the CRM pipeline to the mapped "approved" stage. Prefer the v2 API
      // (which moves the opportunity and re-writes the estimate link onto the
      // contact); fall back to the legacy webhook only when v2 isn't configured.
      // We await the v2 sync so we can persist the result (ghlSyncedAt/ghlStatus)
      // and surface a verifiable [GHL] log line; failures never block acceptance.
      const settings = await getOrCreateSettings();
      const quoteUrl = absoluteQuoteUrl(settings.appBaseUrl, updated.publicToken);

      let synced = updated;
      if (ghlV2Ready(settings)) {
        const ghl = await syncQuoteToGhl(updated, settings, quoteUrl);
        console.log(
          `[GHL] accept sync token=${updated.publicToken} status=${ghl.status} ok=${ghl.ok}` +
            (ghl.detail ? ` detail=${ghl.detail}` : ""),
        );
        synced = await updateQuote(updated.id, {
          ghlSyncedAt: ghl.ok ? new Date() : updated.ghlSyncedAt,
          ghlStatus: ghl.status,
        } as Record<string, unknown>);
      } else {
        fireGhlWebhook(updated, settings, quoteUrl).catch(() => {});
      }

      // Fire Housecall Pro webhook on accept (best-effort, gated by toggles).
      fireHcpWebhook(synced, settings, quoteUrl, "quote.accepted").catch(() => {});

      // Housecall Pro v2 API: create an UNSCHEDULED job for the approved quote
      // (the HCP user drags it onto the calendar). Awaited + persisted.
      if (hcpV2Ready(settings)) {
        const hcp = await syncQuoteOnApprove(synced, settings, quoteUrl);
        synced = await updateQuote(synced.id, hcp as Record<string, unknown>);
      }

      return withLiveStatus(synced);
    }),

  // ---- Admin: internal builder creates a quote on behalf of a customer ----
  createInternal: protectedProcedure
    .input(
      z.object({
        customerName: z.string().min(1),
        customerEmail: z.string().email().or(z.literal("")).optional(),
        customerPhone: z.string().optional(),
        propertyAddress: z.string().optional(),
        propertyCity: z.string().optional(),
        propertyState: z.string().optional(),
        propertyZip: z.string().optional(),
        ...intakeShape,
        bedrooms: z.number().int().min(0),
        bathrooms: z.number().int().min(0),
        origin: z.string().url(),
      }),
    )
    .mutation(async ({ input }) => {
      const settings = await getOrCreateSettings();
      const computedTiers = computeTiers(settings.tiers, {
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
      });
      const serviceSelections = [{ bedrooms: input.bedrooms, bathrooms: input.bathrooms }];
      const expiresAt = new Date(Date.now() + settings.quoteExpiryDays * 24 * 60 * 60 * 1000);
      const token = nanoid(16);

      const customer = await upsertCustomerFromQuote({
        name: input.customerName,
        company: input.customerCompany || null,
        email: input.customerEmail || null,
        phone: input.customerPhone || null,
        altPhone: input.customerAltPhone || null,
        okToText: input.okToText ?? null,
        address: input.propertyAddress || null,
        city: input.propertyCity || null,
        state: input.propertyState || null,
        zip: input.propertyZip || null,
        leadSource: input.leadSource || null,
      });

      const quote = await createQuote({
        publicToken: token,
        customerId: customer.id,
        source: "internal",
        customerName: input.customerName,
        customerEmail: input.customerEmail || null,
        customerPhone: input.customerPhone || null,
        propertyAddress: input.propertyAddress || null,
        propertyCity: input.propertyCity || null,
        propertyState: input.propertyState || null,
        propertyZip: input.propertyZip || null,
        ...intakeQuoteFields(input),
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        serviceSelections,
        computedTiers,
        brandSnapshot: buildBrandSnapshot(settings),
        // Internal quotes start as DRAFT: nothing is pushed to the CRM until the
        // user reviews the preview and clicks "Send Quote".
        status: "draft",
        expiresAt,
      });

      const quoteUrl = absoluteQuoteUrl(input.origin, token);
      // No CRM/webhook side effects on draft creation — that happens on send.
      return { token, url: quoteUrl, id: quote.id, quote: withLiveStatus(quote) };
    }),

  // ---- Admin: update a draft quote (edit before sending). Recomputes packages
  // from the latest bedrooms/bathrooms + current pricing settings. Only drafts
  // can be edited this way. ----
  updateDraft: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        customerName: z.string().min(1),
        customerEmail: z.string().email().or(z.literal("")).optional(),
        customerPhone: z.string().optional(),
        propertyAddress: z.string().optional(),
        propertyCity: z.string().optional(),
        propertyState: z.string().optional(),
        propertyZip: z.string().optional(),
        ...intakeShape,
        bedrooms: z.number().int().min(0),
        bathrooms: z.number().int().min(0),
      }),
    )
    .mutation(async ({ input }) => {
      const existing = await getQuoteById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" });
      if (existing.status !== "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only draft quotes can be edited. This quote has already been sent.",
        });
      }
      const settings = await getOrCreateSettings();
      const computedTiers = computeTiers(settings.tiers, {
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
      });
      await upsertCustomerFromQuote({
        name: input.customerName,
        company: input.customerCompany || null,
        email: input.customerEmail || null,
        phone: input.customerPhone || null,
        altPhone: input.customerAltPhone || null,
        okToText: input.okToText ?? null,
        address: input.propertyAddress || null,
        city: input.propertyCity || null,
        state: input.propertyState || null,
        zip: input.propertyZip || null,
        leadSource: input.leadSource || null,
      });
      const updated = await updateQuote(input.id, {
        customerName: input.customerName,
        customerEmail: input.customerEmail || null,
        customerPhone: input.customerPhone || null,
        propertyAddress: input.propertyAddress || null,
        propertyCity: input.propertyCity || null,
        propertyState: input.propertyState || null,
        propertyZip: input.propertyZip || null,
        ...intakeQuoteFields(input),
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        serviceSelections: [{ bedrooms: input.bedrooms, bathrooms: input.bathrooms }],
        computedTiers,
      } as Record<string, unknown>);
      return { quote: withLiveStatus(updated) };
    }),

  // ---- Admin: send a draft quote. This is the single moment the quote goes
  // live: status flips draft -> pending and the contact is pushed into the
  // mapped CRM pipeline stage (GHL delivers the quote link from there). ----
  sendQuote: protectedProcedure
    .input(z.object({ id: z.number().int(), origin: z.string().url() }))
    .mutation(async ({ input }) => {
      const existing = await getQuoteById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" });
      if (existing.status !== "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This quote has already been sent.",
        });
      }
      const settings = await getOrCreateSettings();
      const sent = await updateQuote(input.id, {
        status: "pending",
        sentAt: new Date(),
      } as Record<string, unknown>);

      const quoteUrl = absoluteQuoteUrl(input.origin, sent.publicToken);
      // Push to the mapped CRM pipeline stage. v2 syncs the opportunity; the
      // legacy raw webhook fires only when v2 isn't configured.
      const ghl = ghlV2Ready(settings)
        ? await syncQuoteToGhl(sent, settings, quoteUrl)
        : await fireGhlWebhook(sent, settings, quoteUrl);
      let updated = await updateQuote(input.id, {
        ghlSyncedAt: ghl.ok ? new Date() : null,
        ghlStatus: ghl.status,
      } as Record<string, unknown>);
      // Housecall Pro webhook on send (best-effort, gated by toggles).
      fireHcpWebhook(updated, settings, quoteUrl, "quote.created").catch(() => {});
      // Housecall Pro v2 API: match/create customer + create estimate on send.
      if (hcpV2Ready(settings)) {
        const hcp = await syncQuoteOnSend(updated, settings, quoteUrl);
        updated = await updateQuote(input.id, hcp as Record<string, unknown>);
      }
      return { quote: withLiveStatus(updated), ghlOk: ghl.ok, ghlStatus: ghl.status };
    }),

  // ---- Admin: dashboard summary stats ----
  dashboard: protectedProcedure.query(async () => {
    // Drafts are unsent and must not count toward pipeline/conversion stats.
    const rows = (await listQuotes()).map(withLiveStatus).filter((r) => r.status !== "draft");
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const total = rows.length;
    const pending = rows.filter((r) => r.status === "pending").length;
    const accepted = rows.filter((r) => r.status === "accepted").length;
    const expired = rows.filter((r) => r.status === "expired").length;

    // Accepted revenue: sum of the selected tier totals.
    let acceptedRevenue = 0;
    for (const r of rows) {
      if (r.status === "accepted" && r.selectedTierKey) {
        const tier = r.computedTiers.find((t) => t.key === r.selectedTierKey);
        if (tier) acceptedRevenue += tier.total;
      }
    }

    // Pipeline value: midpoint tier of pending quotes.
    let pipelineValue = 0;
    for (const r of rows) {
      if (r.status === "pending" && r.computedTiers.length > 0) {
        const mid = r.computedTiers[Math.floor(r.computedTiers.length / 2)];
        pipelineValue += mid.total;
      }
    }

    // Quotes per week for the last 12 weeks.
    const weeks: { label: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const start = now - (i + 1) * 7 * dayMs;
      const end = now - i * 7 * dayMs;
      const count = rows.filter((r) => {
        const t = new Date(r.createdAt).getTime();
        return t >= start && t < end;
      }).length;
      const d = new Date(end);
      weeks.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, count });
    }

    const recent = rows.slice(0, 8);
    const conversionRate = total > 0 ? Math.round((accepted / total) * 100) : 0;

    return {
      total,
      pending,
      accepted,
      expired,
      acceptedRevenue,
      pipelineValue,
      conversionRate,
      weeks,
      recent,
    };
  }),

  // ---- Admin: reports / bid performance over a time window ----
  reports: protectedProcedure
    .input(z.object({ days: z.number().int().min(7).max(365).default(90) }).optional())
    .query(async ({ input }) => {
      const days = input?.days ?? 90;
      const all = (await listQuotes()).map(withLiveStatus).filter((r) => r.status !== "draft");
      return buildReports(all, days, Date.now());
    }),

  // ---- Admin: list all quotes with live status ----
  list: protectedProcedure.query(async () => {
    const rows = await listQuotes();
    // Hide unsent drafts from the main quotes list (they live on New Quote until sent).
    return rows.map(withLiveStatus).filter((r) => r.status !== "draft");
  }),

  // ---- Admin: customers list ----
  customers: protectedProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const list = await listCustomers(input?.search);
      // attach quote counts
      const all = (await listQuotes()).map(withLiveStatus);
      return list.map((c) => {
        const cq = all.filter((q) => q.customerId === c.id);
        return {
          ...c,
          quoteCount: cq.length,
          acceptedCount: cq.filter((q) => q.status === "accepted").length,
          lastQuoteAt: cq[0]?.createdAt ?? null,
        };
      });
    }),

  // ---- Admin: one customer + their quotes ----
  customerDetail: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const customer = await getCustomerById(input.id);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND" });
      const quotesList = (await listQuotesByCustomer(input.id)).map(withLiveStatus);
      return { customer, quotes: quotesList };
    }),

  // ---- Admin: update customer contact info / notes ----
  updateCustomer: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(1).optional(),
        company: z.string().optional(),
        email: z.string().email().or(z.literal("")).optional(),
        phone: z.string().optional(),
        altPhone: z.string().optional(),
        okToText: z.boolean().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zip: z.string().optional(),
        leadSource: z.string().optional(),
        hcpCustomerUrl: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      const patch: Record<string, unknown> = {};
      if (rest.name !== undefined) patch.name = rest.name;
      if (rest.company !== undefined) patch.company = rest.company || null;
      if (rest.email !== undefined) patch.email = rest.email || null;
      if (rest.phone !== undefined) patch.phone = rest.phone || null;
      if (rest.altPhone !== undefined) patch.altPhone = rest.altPhone || null;
      if (rest.okToText !== undefined) patch.okToText = rest.okToText;
      if (rest.address !== undefined) patch.address = rest.address || null;
      if (rest.city !== undefined) patch.city = rest.city || null;
      if (rest.state !== undefined) patch.state = rest.state || null;
      if (rest.zip !== undefined) patch.zip = rest.zip || null;
      if (rest.leadSource !== undefined) patch.leadSource = rest.leadSource || null;
      if (rest.hcpCustomerUrl !== undefined) patch.hcpCustomerUrl = rest.hcpCustomerUrl || null;
      if (rest.notes !== undefined) patch.notes = rest.notes;
      return updateCustomer(id, patch);
    }),

  // ---- Admin: permanently delete a customer and all their quotes ----
  deleteCustomer: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const customer = await getCustomerById(input.id);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
      await deleteCustomer(input.id);
      return { success: true };
    }),

  // ---- Admin: get one quote ----
  getById: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const quote = await getQuoteById(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
      return withLiveStatus(quote);
    }),

  // ---- Admin: manually (re)send a quote via a channel ----
  deliver: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        channel: z.enum(["email", "sms"]),
      }),
    )
    .mutation(async ({ input }) => {
      const quote = await getQuoteById(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND" });
      if (!canDeliver(input.channel, quote)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            input.channel === "email"
              ? "No email address on this quote"
              : "No phone number on this quote",
        });
      }
      const settings = await getOrCreateSettings();
      const quoteUrl = `/quote/${quote.publicToken}`;
      // Delivery is performed by GHL via webhook; re-fire to trigger the workflow.
      const ghl = await fireGhlWebhook(quote, settings, quoteUrl);

      const patch =
        input.channel === "email" ? { emailSentAt: new Date() } : { smsSentAt: new Date() };
      const updated = await updateQuote(quote.id, patch);
      return {
        quote: withLiveStatus(updated),
        ghlStatus: ghl.status,
        viaGhl: deliveryHandledByGhl(settings),
      };
    }),

  // ---- Admin: manually set status (dropdown). Accepted mirrors approve and
  // fires CRM webhooks; pending/declined/expired fire none. ----
  setStatus: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        status: z.enum(["pending", "accepted", "declined", "expired"]),
        tierKey: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const quote = await getQuoteById(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" });

      const { patch, fireAcceptedWebhooks } = statusChangePlan(
        quote,
        input.status,
        input.tierKey,
      );
      let updated = await updateQuote(input.id, patch as Record<string, unknown>);

      // Treat a manual switch to "accepted" exactly like approve for webhook gating.
      if (fireAcceptedWebhooks) {
        const settings = await getOrCreateSettings();
        const tier = updated.computedTiers.find((t) => t.key === updated.selectedTierKey);
        notifyOwner({
          title: `Quote marked accepted: ${quote.customerName}`,
          content: `${quote.customerName}'s quote status was set to accepted${
            tier ? ` on the "${tier.name}" package ($${tier.total})` : ""
          }.`,
        }).catch(() => {});
        const qUrl = absoluteQuoteUrl(settings.appBaseUrl, updated.publicToken);
        if (ghlV2Ready(settings)) {
          syncQuoteToGhl(updated, settings, qUrl).catch(() => {});
        } else {
          fireGhlWebhook(updated, settings, "").catch(() => {});
        }
        fireHcpWebhook(updated, settings, "", "quote.accepted").catch(() => {});
        // HCP v2: create the unscheduled job for the now-accepted quote.
        if (hcpV2Ready(settings)) {
          const qUrl = absoluteQuoteUrl(settings.appBaseUrl, updated.publicToken);
          const hcp = await syncQuoteOnApprove(updated, settings, qUrl);
          updated = await updateQuote(updated.id, hcp as Record<string, unknown>);
        }
      } else if (input.status === "pending" || input.status === "declined") {
        // Manual move to Quote Sent / Declined: v2 sync moves the opportunity to
        // the mapped stage (no legacy webhook fires for these).
        const settings = await getOrCreateSettings();
        if (ghlV2Ready(settings)) {
          const qUrl = absoluteQuoteUrl(settings.appBaseUrl, updated.publicToken);
          syncQuoteToGhl(updated, settings, qUrl).catch(() => {});
        }
        // HCP v2: on manual decline, append a decline note to the customer.
        if (input.status === "declined" && hcpV2Ready(settings)) {
          const hcp = await syncQuoteOnDecline(updated, settings);
          updated = await updateQuote(updated.id, hcp as Record<string, unknown>);
        }
      }

      return withLiveStatus(updated);
    }),

  // ---- Admin: approve a quote (mark accepted + fire accepted webhooks) ----
  approve: protectedProcedure
    .input(z.object({ id: z.number().int(), tierKey: z.string().optional() }))
    .mutation(async ({ input }) => {
      const quote = await getQuoteById(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" });
      // Pick the tier: explicit choice, existing selection, or the highlighted/midpoint tier.
      const tierKey = resolveApprovalTierKey(quote, input.tierKey);
      const updated = await updateQuote(quote.id, {
        status: "accepted",
        selectedTierKey: tierKey,
        acceptedAt: new Date(),
        declinedAt: null,
      });

      const settings = await getOrCreateSettings();
      const tier = updated.computedTiers.find((t) => t.key === tierKey);
      notifyOwner({
        title: `Quote approved: ${quote.customerName}`,
        content: `${quote.customerName}'s quote was approved${
          tier ? ` on the "${tier.name}" package ($${tier.total})` : ""
        }.`,
      }).catch(() => {});
      // Fire accepted webhooks (best-effort). Approve fires; decline never does.
      let approved = updated;
      if (webhooksForQuoteAction("approve").fireAcceptedWebhooks) {
        const qUrl = absoluteQuoteUrl(settings.appBaseUrl, updated.publicToken);
        if (ghlV2Ready(settings)) {
          syncQuoteToGhl(updated, settings, qUrl).catch(() => {});
        } else {
          fireGhlWebhook(updated, settings, "").catch(() => {});
        }
        fireHcpWebhook(updated, settings, "", "quote.accepted").catch(() => {});
        // HCP v2: create the unscheduled job for the approved quote.
        if (hcpV2Ready(settings)) {
          const hcp = await syncQuoteOnApprove(updated, settings, qUrl);
          approved = await updateQuote(updated.id, hcp as Record<string, unknown>);
        }
      }

      return withLiveStatus(approved);
    }),

  // ---- Admin: decline a quote (moves CRM opportunity to Declined stage; no
  // legacy 'accepted' webhooks) ----
  decline: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const quote = await getQuoteById(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" });
      const updated = await updateQuote(quote.id, {
        status: "declined",
        acceptedAt: null,
        declinedAt: new Date(),
      });
      // v2 sync moves the opportunity to the mapped Declined stage. The legacy
      // raw webhook intentionally does NOT fire on decline.
      const settings = await getOrCreateSettings();
      let declined = updated;
      if (ghlV2Ready(settings)) {
        const qUrl = absoluteQuoteUrl(settings.appBaseUrl, updated.publicToken);
        syncQuoteToGhl(updated, settings, qUrl).catch(() => {});
      }
      // HCP v2: append a decline note to the customer (no job created).
      if (hcpV2Ready(settings)) {
        const hcp = await syncQuoteOnDecline(updated, settings);
        declined = await updateQuote(updated.id, hcp as Record<string, unknown>);
      }
      return withLiveStatus(declined);
    }),

  // ---- Admin: manually retry the Housecall Pro sync for one quote. Picks the
  // right action based on the quote's current live status (send vs approve vs
  // decline). Returns the refreshed quote so the UI can show the new status. ----
  retryHcpSync: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const quote = await getQuoteById(input.id);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" });
      const settings = await getOrCreateSettings();
      if (!hcpV2Ready(settings)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Housecall Pro is not connected. Enable it in Connections first.",
        });
      }
      const qUrl = absoluteQuoteUrl(settings.appBaseUrl, quote.publicToken);
      const status = liveStatus(quote);
      const hcp =
        status === "accepted"
          ? await syncQuoteOnApprove(quote, settings, qUrl)
          : status === "declined"
            ? await syncQuoteOnDecline(quote, settings)
            : await syncQuoteOnSend(quote, settings, qUrl);
      const updated = await updateQuote(quote.id, hcp as Record<string, unknown>);
      return withLiveStatus(updated);
    }),
});
