import { describe, expect, it } from "vitest";
import { buildReports, acceptedTotalOf, type ReportQuote } from "../shared/reports";
import { DEFAULT_FORM_FIELDS } from "../drizzle/schema";

const dayMs = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-06-09T00:00:00.000Z").getTime();

function tier(key: string, total: number) {
  return { key, name: key, description: "", features: [], total };
}

function quote(partial: Partial<ReportQuote>): ReportQuote {
  return {
    status: "pending",
    selectedTierKey: null,
    computedTiers: [tier("good", 100), tier("better", 130), tier("best", 170)],
    createdAt: new Date(NOW - 2 * dayMs),
    ...partial,
  };
}

describe("acceptedTotalOf", () => {
  it("uses the selected tier's total when set", () => {
    expect(acceptedTotalOf(quote({ selectedTierKey: "best" }))).toBe(170);
  });

  it("falls back to the midpoint tier when no tier selected", () => {
    expect(acceptedTotalOf(quote({ selectedTierKey: null }))).toBe(130);
  });

  it("returns 0 when there are no tiers", () => {
    expect(acceptedTotalOf(quote({ computedTiers: [] }))).toBe(0);
  });
});

describe("buildReports", () => {
  it("computes totals, close rate, and revenue", () => {
    const quotes: ReportQuote[] = [
      quote({ status: "accepted", selectedTierKey: "better" }), // 130
      quote({ status: "accepted", selectedTierKey: "best" }), // 170
      quote({ status: "pending" }),
      quote({ status: "expired" }),
    ];
    const r = buildReports(quotes, 90, NOW);

    expect(r.total).toBe(4);
    expect(r.accepted).toBe(2);
    expect(r.pending).toBe(1);
    expect(r.expired).toBe(1);
    expect(r.closeRate).toBe(50); // 2/4
    expect(r.acceptedRevenue).toBe(300); // 130 + 170
    expect(r.avgAccepted).toBe(150); // 300 / 2
    expect(r.avgQuoted).toBe(130); // midpoint of every quote
  });

  it("excludes quotes outside the time window", () => {
    const quotes: ReportQuote[] = [
      quote({ createdAt: new Date(NOW - 5 * dayMs) }), // inside 30d
      quote({ createdAt: new Date(NOW - 120 * dayMs) }), // outside 30d
    ];
    const r = buildReports(quotes, 30, NOW);
    expect(r.total).toBe(1);
  });

  it("aggregates per-package quotes and accepted revenue", () => {
    const quotes: ReportQuote[] = [
      // Two quotes offer all three packages; one accepts "good", one accepts "best".
      quote({ status: "accepted", selectedTierKey: "good" }), // 100
      quote({ status: "accepted", selectedTierKey: "best" }), // 170
      quote({ status: "pending" }),
    ];
    const r = buildReports(quotes, 90, NOW);
    // Each package appears on every quote.
    expect(r.packages).toHaveLength(3);
    const good = r.packages.find((p) => p.key === "good")!;
    const best = r.packages.find((p) => p.key === "best")!;
    const better = r.packages.find((p) => p.key === "better")!;
    expect(good.quotes).toBe(3);
    expect(good.accepted).toBe(1);
    expect(good.revenue).toBe(100);
    expect(best.accepted).toBe(1);
    expect(best.revenue).toBe(170);
    expect(better.accepted).toBe(0);
    expect(better.revenue).toBe(0);
  });

  it("breaks down count and value by status", () => {
    const quotes: ReportQuote[] = [
      quote({ status: "accepted", selectedTierKey: "best" }), // 170 won
      quote({ status: "pending" }), // 130 pipeline (midpoint)
      quote({ status: "expired" }), // 130 lapsed (midpoint)
    ];
    const r = buildReports(quotes, 90, NOW);
    const accepted = r.byStatus.find((s) => s.status === "accepted")!;
    const pending = r.byStatus.find((s) => s.status === "pending")!;
    const expired = r.byStatus.find((s) => s.status === "expired")!;
    expect(accepted).toMatchObject({ count: 1, value: 170 });
    expect(pending).toMatchObject({ count: 1, value: 130 });
    expect(expired).toMatchObject({ count: 1, value: 130 });
  });

  it("produces a weekly series sized to the window", () => {
    const r = buildReports([], 90, NOW);
    expect(r.series.length).toBe(Math.ceil(90 / 7));
    expect(r.total).toBe(0);
    expect(r.closeRate).toBe(0);
  });
});

describe("DEFAULT_FORM_FIELDS", () => {
  it("includes all seven customer fields with name required", () => {
    const keys = DEFAULT_FORM_FIELDS.map((f) => f.key);
    expect(keys).toContain("customerName");
    expect(keys).toContain("propertyZip");
    expect(DEFAULT_FORM_FIELDS).toHaveLength(7);
    const name = DEFAULT_FORM_FIELDS.find((f) => f.key === "customerName")!;
    expect(name.enabled).toBe(true);
    expect(name.required).toBe(true);
  });
});
