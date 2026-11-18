import { describe, it, expect } from "vitest";
import {
  buildQuoteTimeline,
  buildCustomerTimeline,
  type TimelineInputQuote,
} from "../shared/timeline";

const base: TimelineInputQuote = {
  id: 1,
  selectedTierKey: "biweekly",
  computedTiers: [{ key: "biweekly", name: "Bi-Weekly", total: 528 }],
  createdAt: new Date("2026-06-01T10:00:00Z"),
  viewedAt: null,
  acceptedAt: null,
  declinedAt: null,
  expiresAt: new Date("2026-06-15T10:00:00Z"),
  status: "pending",
};

describe("buildQuoteTimeline", () => {
  it("always includes a 'sent' event from createdAt", () => {
    const events = buildQuoteTimeline(base);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("sent");
    expect(events[0].at).toBe(new Date("2026-06-01T10:00:00Z").getTime());
  });

  it("adds a 'viewed' event when viewedAt is set", () => {
    const events = buildQuoteTimeline({
      ...base,
      viewedAt: new Date("2026-06-02T12:00:00Z"),
    });
    expect(events.map((e) => e.type)).toContain("viewed");
  });

  it("adds an 'approved' event with tier detail when accepted", () => {
    const events = buildQuoteTimeline({
      ...base,
      status: "accepted",
      acceptedAt: new Date("2026-06-03T09:00:00Z"),
    });
    const approved = events.find((e) => e.type === "approved");
    expect(approved).toBeDefined();
    expect(approved?.detail).toBe("Bi-Weekly — $528");
  });

  it("adds a 'declined' event when declinedAt is set", () => {
    const events = buildQuoteTimeline({
      ...base,
      status: "declined",
      declinedAt: new Date("2026-06-03T09:00:00Z"),
    });
    expect(events.map((e) => e.type)).toContain("declined");
  });

  it("shows 'expired' only when expired and never accepted/declined", () => {
    const expired = buildQuoteTimeline({ ...base, status: "expired" });
    expect(expired.map((e) => e.type)).toContain("expired");

    // Accepted-then-expired should NOT show an expired event.
    const acceptedExpired = buildQuoteTimeline({
      ...base,
      status: "expired",
      acceptedAt: new Date("2026-06-04T09:00:00Z"),
    });
    expect(acceptedExpired.map((e) => e.type)).not.toContain("expired");
  });

  it("returns events newest-first", () => {
    const events = buildQuoteTimeline({
      ...base,
      status: "accepted",
      viewedAt: new Date("2026-06-02T12:00:00Z"),
      acceptedAt: new Date("2026-06-03T09:00:00Z"),
    });
    const times = events.map((e) => e.at);
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(events[0].type).toBe("approved");
  });

  it("ignores null/invalid timestamps gracefully", () => {
    const events = buildQuoteTimeline({
      ...base,
      createdAt: null,
      viewedAt: null,
    });
    expect(events).toHaveLength(0);
  });
});

describe("buildCustomerTimeline", () => {
  it("merges events across quotes newest-first", () => {
    const q1: TimelineInputQuote = {
      ...base,
      id: 1,
      createdAt: new Date("2026-06-01T10:00:00Z"),
    };
    const q2: TimelineInputQuote = {
      ...base,
      id: 2,
      createdAt: new Date("2026-06-05T10:00:00Z"),
      status: "accepted",
      acceptedAt: new Date("2026-06-06T10:00:00Z"),
    };
    const events = buildCustomerTimeline([q1, q2]);
    // Newest first: q2 approved, q2 sent, q1 sent
    expect(events[0].quoteId).toBe(2);
    expect(events[0].type).toBe("approved");
    expect(events[events.length - 1].quoteId).toBe(1);
  });

  it("returns empty array for no quotes", () => {
    expect(buildCustomerTimeline([])).toEqual([]);
  });
});
