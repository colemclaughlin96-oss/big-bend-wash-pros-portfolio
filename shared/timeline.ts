// Pure helpers for building a per-quote activity timeline from quote timestamps.
// Kept framework-free so it can be unit-tested and reused on client + server.

export type TimelineEventType = "sent" | "viewed" | "approved" | "declined" | "expired";

export type TimelineInputQuote = {
  id: number;
  customerName?: string;
  selectedTierKey?: string | null;
  computedTiers?: { key: string; name: string; total: number }[];
  createdAt: Date | string | number | null;
  viewedAt?: Date | string | number | null;
  acceptedAt?: Date | string | number | null;
  declinedAt?: Date | string | number | null;
  expiresAt?: Date | string | number | null;
  status: "draft" | "pending" | "accepted" | "declined" | "expired";
};

export type TimelineEvent = {
  quoteId: number;
  type: TimelineEventType;
  // Epoch milliseconds (UTC). Frontend converts to local time for display.
  at: number;
  label: string;
  detail?: string;
};

function toMs(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// Build a chronological (newest-first) list of activity events for one quote.
export function buildQuoteTimeline(quote: TimelineInputQuote): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  const sentAt = toMs(quote.createdAt);
  if (sentAt !== null) {
    events.push({ quoteId: quote.id, type: "sent", at: sentAt, label: "Quote sent" });
  }

  const viewedAt = toMs(quote.viewedAt);
  if (viewedAt !== null) {
    events.push({
      quoteId: quote.id,
      type: "viewed",
      at: viewedAt,
      label: "Viewed by customer",
    });
  }

  const acceptedAt = toMs(quote.acceptedAt);
  if (acceptedAt !== null) {
    const tier = quote.computedTiers?.find((t) => t.key === quote.selectedTierKey);
    events.push({
      quoteId: quote.id,
      type: "approved",
      at: acceptedAt,
      label: "Approved",
      detail: tier ? `${tier.name} — $${tier.total}` : undefined,
    });
  }

  const declinedAt = toMs(quote.declinedAt);
  if (declinedAt !== null) {
    events.push({ quoteId: quote.id, type: "declined", at: declinedAt, label: "Declined" });
  }

  // Only show an "expired" event when the quote is actually expired and was
  // never accepted/declined (a settled quote isn't "expired" on the timeline).
  const expiresAt = toMs(quote.expiresAt);
  if (
    quote.status === "expired" &&
    expiresAt !== null &&
    acceptedAt === null &&
    declinedAt === null
  ) {
    events.push({ quoteId: quote.id, type: "expired", at: expiresAt, label: "Quote expired" });
  }

  return events.sort((a, b) => b.at - a.at);
}

// Merge timelines across all of a customer's quotes into one newest-first feed.
export function buildCustomerTimeline(quotes: TimelineInputQuote[]): TimelineEvent[] {
  return quotes.flatMap((q) => buildQuoteTimeline(q)).sort((a, b) => b.at - a.at);
}
