// Pure, I/O-free reports aggregation — shared by the server router and tests.
import type { ComputedTier } from "../drizzle/schema";

export type ReportQuote = {
  status: "draft" | "pending" | "accepted" | "declined" | "expired";
  selectedTierKey: string | null;
  computedTiers: ComputedTier[];
  createdAt: Date | string | number;
};

export type ReportsResult = {
  days: number;
  total: number;
  accepted: number;
  pending: number;
  declined: number;
  expired: number;
  closeRate: number;
  acceptedRevenue: number;
  avgAccepted: number;
  avgQuoted: number;
  series: { label: string; created: number; accepted: number; revenue: number }[];
  // Breakdown by frequency package (tier): how often each package was the
  // selected/accepted option and the revenue it generated.
  packages: { key: string; name: string; quotes: number; accepted: number; revenue: number }[];
  byStatus: { status: "accepted" | "pending" | "declined" | "expired"; count: number; value: number }[];
};

// The value of a quote's selected tier, falling back to the midpoint tier.
export function acceptedTotalOf(q: ReportQuote): number {
  if (q.selectedTierKey) {
    const t = q.computedTiers.find((x) => x.key === q.selectedTierKey);
    if (t) return t.total;
  }
  return q.computedTiers.length
    ? q.computedTiers[Math.floor(q.computedTiers.length / 2)].total
    : 0;
}

// The midpoint (typical) quoted value, regardless of acceptance.
export function quotedMidpointOf(q: ReportQuote): number {
  return q.computedTiers.length
    ? q.computedTiers[Math.floor(q.computedTiers.length / 2)].total
    : 0;
}

/**
 * Build the full reports payload from already-live-statused quotes.
 * `now` is injectable so tests are deterministic.
 */
export function buildReports(quotes: ReportQuote[], days: number, now: number): ReportsResult {
  const dayMs = 24 * 60 * 60 * 1000;
  const windowStart = now - days * dayMs;
  const rows = quotes.filter((r) => new Date(r.createdAt).getTime() >= windowStart);

  const total = rows.length;
  const accepted = rows.filter((r) => r.status === "accepted").length;
  const pending = rows.filter((r) => r.status === "pending").length;
  const declined = rows.filter((r) => r.status === "declined").length;
  const expired = rows.filter((r) => r.status === "expired").length;
  const closeRate = total > 0 ? Math.round((accepted / total) * 100) : 0;

  let acceptedRevenue = 0;
  for (const r of rows) {
    if (r.status === "accepted") acceptedRevenue += acceptedTotalOf(r);
  }
  const avgAccepted = accepted > 0 ? Math.round(acceptedRevenue / accepted) : 0;

  let quotedSum = 0;
  for (const r of rows) quotedSum += quotedMidpointOf(r);
  const avgQuoted = total > 0 ? Math.round(quotedSum / total) : 0;

  const weekCount = Math.max(1, Math.ceil(days / 7));
  const series: ReportsResult["series"] = [];
  for (let i = weekCount - 1; i >= 0; i--) {
    const start = now - (i + 1) * 7 * dayMs;
    const end = now - i * 7 * dayMs;
    const bucket = rows.filter((r) => {
      const t = new Date(r.createdAt).getTime();
      return t >= start && t < end;
    });
    const acceptedBucket = bucket.filter((r) => r.status === "accepted");
    const d = new Date(end);
    series.push({
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      created: bucket.length,
      accepted: acceptedBucket.length,
      revenue: acceptedBucket.reduce((s, r) => s + acceptedTotalOf(r), 0),
    });
  }

  // Per-package breakdown. Every quote offers all packages, so "quotes" counts
  // how many quotes included a package; "accepted" + "revenue" attribute to the
  // package the customer actually chose.
  const byPackage = new Map<string, ReportsResult["packages"][number]>();
  for (const r of rows) {
    const acceptedKey =
      r.status === "accepted"
        ? r.selectedTierKey ??
          (r.computedTiers.length
            ? r.computedTiers[Math.floor(r.computedTiers.length / 2)].key
            : null)
        : null;
    for (const tier of r.computedTiers) {
      const entry =
        byPackage.get(tier.key) ?? {
          key: tier.key,
          name: tier.name,
          quotes: 0,
          accepted: 0,
          revenue: 0,
        };
      entry.quotes += 1;
      if (acceptedKey && tier.key === acceptedKey) {
        entry.accepted += 1;
        entry.revenue += tier.total;
      }
      byPackage.set(tier.key, entry);
    }
  }
  const packages = Array.from(byPackage.values()).sort((a, b) => b.quotes - a.quotes);

  // Value by lifecycle status. Accepted uses the selected/midpoint tier;
  // pending/expired use the midpoint (typical) quoted value as pipeline/lost value.
  const statusValue = { accepted: 0, pending: 0, declined: 0, expired: 0 };
  for (const r of rows) {
    if (r.status === "accepted") statusValue.accepted += acceptedTotalOf(r);
    else if (r.status === "pending") statusValue.pending += quotedMidpointOf(r);
    else if (r.status === "declined") statusValue.declined += quotedMidpointOf(r);
    else statusValue.expired += quotedMidpointOf(r);
  }
  const byStatus: ReportsResult["byStatus"] = [
    { status: "accepted", count: accepted, value: statusValue.accepted },
    { status: "pending", count: pending, value: statusValue.pending },
    { status: "declined", count: declined, value: statusValue.declined },
    { status: "expired", count: expired, value: statusValue.expired },
  ];

  return {
    days,
    total,
    accepted,
    pending,
    declined,
    expired,
    closeRate,
    acceptedRevenue,
    avgAccepted,
    avgQuoted,
    series,
    packages,
    byStatus,
  };
}
