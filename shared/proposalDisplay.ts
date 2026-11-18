// Presentation helpers for the customer-facing proposal cards.
// Pure functions, no I/O, so the cadence badges + savings strike are testable
// without rendering React. These do NOT affect pricing math — they only decide
// how a tier is *displayed* (badge text, "/ visit" suffix, and the cosmetic
// struck-through "compare" price that shows savings vs the one-time deep clean).

export type CadenceMeta = {
  badge: string;
  perVisit: boolean;
  recurring: boolean;
};

// Keyed by tier.key so renaming a tier's display name never breaks this.
// Unknown keys return null (no badge, no per-visit suffix, never recurring).
const CADENCE_BY_KEY: Record<string, CadenceMeta> = {
  deep: { badge: "One-time", perVisit: false, recurring: false },
  monthly: { badge: "Every 4 weeks", perVisit: true, recurring: true },
  biweekly: { badge: "Every 2 weeks", perVisit: true, recurring: true },
  weekly: { badge: "Every week", perVisit: true, recurring: true },
};

export function cadenceFor(key: string): CadenceMeta | null {
  return CADENCE_BY_KEY[key] ?? null;
}

export type SavingsResult = {
  /** Whether to show a struck-through compare price for this tier. */
  showStrike: boolean;
  /** The struck-through "compare" amount (the one-time anchor), or null. */
  compareAmount: number | null;
  /** Whole-dollar savings vs the anchor (0 when no strike). */
  save: number;
};

/**
 * Decide the savings strike for a single tier.
 *
 * Rules (intentionally simple, no fabricated discounts):
 *  - Only recurring plans (monthly/biweekly/weekly) ever show a strike.
 *  - The compare anchor is the one-time Initial Deep Clean total for THIS home.
 *  - Only show it when the anchor is strictly higher than the tier's price
 *    (otherwise "savings" would be zero or negative, which would look broken).
 */
export function savingsFor(
  tierKey: string,
  tierTotal: number,
  deepCleanTotal: number | null | undefined,
): SavingsResult {
  const cad = cadenceFor(tierKey);
  const recurring = cad?.recurring ?? false;
  const anchor =
    typeof deepCleanTotal === "number" && Number.isFinite(deepCleanTotal)
      ? deepCleanTotal
      : null;

  if (!recurring || anchor == null || anchor <= tierTotal) {
    return { showStrike: false, compareAmount: null, save: 0 };
  }
  return {
    showStrike: true,
    compareAmount: anchor,
    save: Math.round(anchor - tierTotal),
  };
}

/** Convenience: pull the deep-clean total out of a list of computed tiers. */
export function deepCleanAnchor(
  tiers: { key: string; total: number }[],
): number | null {
  const deep = tiers.find((t) => t.key === "deep");
  return deep ? deep.total : null;
}
