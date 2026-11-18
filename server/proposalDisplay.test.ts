import { describe, it, expect } from "vitest";
import {
  cadenceFor,
  savingsFor,
  deepCleanAnchor,
} from "../shared/proposalDisplay";

describe("cadenceFor", () => {
  it("returns one-time, non-recurring meta for the deep clean", () => {
    expect(cadenceFor("deep")).toEqual({
      badge: "One-time",
      perVisit: false,
      recurring: false,
    });
  });

  it("marks monthly/biweekly/weekly as recurring per-visit plans", () => {
    expect(cadenceFor("monthly")?.recurring).toBe(true);
    expect(cadenceFor("biweekly")?.perVisit).toBe(true);
    expect(cadenceFor("weekly")?.badge).toBe("Every week");
  });

  it("returns null for unknown keys (no badge, safe fallback)", () => {
    expect(cadenceFor("custom-plan")).toBeNull();
  });
});

describe("deepCleanAnchor", () => {
  it("extracts the deep clean total as the compare anchor", () => {
    const anchor = deepCleanAnchor([
      { key: "deep", total: 786 },
      { key: "biweekly", total: 310 },
    ]);
    expect(anchor).toBe(786);
  });

  it("returns null when there is no deep clean tier", () => {
    expect(deepCleanAnchor([{ key: "biweekly", total: 310 }])).toBeNull();
  });
});

describe("savingsFor", () => {
  it("shows a strike + savings for a recurring plan below the anchor", () => {
    const r = savingsFor("biweekly", 310, 786);
    expect(r.showStrike).toBe(true);
    expect(r.compareAmount).toBe(786);
    expect(r.save).toBe(476);
  });

  it("rounds savings to whole dollars", () => {
    expect(savingsFor("monthly", 346.4, 786.2).save).toBe(440);
  });

  it("never shows a strike on the one-time deep clean itself", () => {
    const r = savingsFor("deep", 786, 786);
    expect(r.showStrike).toBe(false);
    expect(r.save).toBe(0);
  });

  it("hides the strike when the anchor is missing", () => {
    expect(savingsFor("biweekly", 310, null).showStrike).toBe(false);
    expect(savingsFor("biweekly", 310, undefined).showStrike).toBe(false);
  });

  it("hides the strike when the anchor is not higher than the price", () => {
    // Anchor equal to or below the tier price would imply zero/negative savings.
    expect(savingsFor("biweekly", 800, 786).showStrike).toBe(false);
    expect(savingsFor("biweekly", 786, 786).showStrike).toBe(false);
  });

  it("never shows a strike for unknown (non-recurring) keys", () => {
    expect(savingsFor("custom", 100, 786).showStrike).toBe(false);
  });
});
