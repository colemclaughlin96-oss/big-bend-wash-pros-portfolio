// Shared pricing engine — used by the server to compute quotes and by tests.
// Pure functions, no I/O, so they are trivially testable.
//
// PRICING MODEL (additive, per-package dollar rates):
//   Each package (tier) stores its own real-dollar rates:
//     price = basePrice + bedrooms * perBedroom + bathrooms * perBathroom
//   No multipliers, no hidden subtotal. Every number an operator types is a
//   real dollar amount, which makes the config screen a single readable table
//   and trivial to reuse for any new client.

export type PricingInputs = {
  bedrooms: number;
  bathrooms: number;
};

export type PricingTier = {
  key: string;
  name: string;
  description: string;
  // Additive dollar rates
  basePrice: number;
  perBedroom: number;
  perBathroom: number;
  features: string[];
  highlighted?: boolean;
  // Deprecated: kept optional so old persisted rows / snapshots don't break type checks.
  multiplier?: number;
};

export type ComputedTierResult = {
  key: string;
  name: string;
  description: string;
  features: string[];
  total: number;
  highlighted?: boolean;
};

/**
 * Compute one package price from its additive rates and the property inputs.
 * Formula: max(0, basePrice + bedrooms*perBedroom + bathrooms*perBathroom)
 */
export function computeTierPrice(tier: PricingTier, inputs: PricingInputs): number {
  const beds = Number.isFinite(inputs.bedrooms) ? Math.max(0, inputs.bedrooms) : 0;
  const baths = Number.isFinite(inputs.bathrooms) ? Math.max(0, inputs.bathrooms) : 0;
  const raw =
    (tier.basePrice || 0) + beds * (tier.perBedroom || 0) + baths * (tier.perBathroom || 0);
  return round2(Math.max(0, raw));
}

/**
 * Generate the four package price points for the given bedrooms/bathrooms.
 */
export function computeTiers(tiers: PricingTier[], inputs: PricingInputs): ComputedTierResult[] {
  return tiers.map((tier) => ({
    key: tier.key,
    name: tier.name,
    description: tier.description,
    features: tier.features,
    highlighted: tier.highlighted,
    total: computeTierPrice(tier, inputs),
  }));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// The list of inclusions every package shows on the proposal. These are
// neutral pressure / exterior-washing placeholders — the operator edits the
// per-tier feature list in the Pricing screen for the real business.
export const SERVICE_CHECKLIST: string[] = [
  "Pre-inspection of all surfaces to be cleaned",
  "Eco-friendly, surface-safe detergents",
  "Low-pressure soft wash on delicate surfaces",
  "High-pressure wash on hard surfaces (concrete, pavers)",
  "Spot treatment of stains, algae, and mildew",
  "Rinse and clean-up of the work area",
  "Protection of nearby plants and landscaping",
  "Post-service walkthrough and satisfaction check",
];

// Backwards-compat alias: older code/tests referenced CLEANING_CHECKLIST.
export const CLEANING_CHECKLIST = SERVICE_CHECKLIST;

// Default package template used when seeding settings for the first time.
// Neutral pressure / exterior-washing packages. Each package is priced
// directly in real dollars using the additive engine:
//   price = basePrice + inputA*perBedroom + inputB*perBathroom
// NOTE: the two numeric inputs are GENERIC (relabel them in the Pricing screen,
// e.g. "stories" and "surfaces"). This is a starting template, not a true
// square-footage washing calculator. Operators edit these numbers directly.
export const DEFAULT_TIERS: PricingTier[] = [
  {
    key: "driveway",
    name: "Driveway & Walkway",
    description:
      "Deep clean of concrete driveways, walkways, and entry areas to remove dirt, oil, and stains.",
    basePrice: 149,
    perBedroom: 25,
    perBathroom: 20,
    features: SERVICE_CHECKLIST,
  },
  {
    key: "housewash",
    name: "House Soft Wash",
    description: "Gentle soft-wash of siding to safely remove algae, dirt, and cobwebs.",
    basePrice: 249,
    perBedroom: 60,
    perBathroom: 30,
    features: SERVICE_CHECKLIST,
    highlighted: true,
  },
  {
    key: "fullexterior",
    name: "Full Exterior Package",
    description: "Our most popular package — house soft wash plus driveway, walkways, and patio.",
    basePrice: 399,
    perBedroom: 80,
    perBathroom: 45,
    features: SERVICE_CHECKLIST,
  },
  {
    key: "roofwash",
    name: "Roof Soft Wash",
    description:
      "Low-pressure roof treatment that removes black streaks, moss, and algae without damage.",
    basePrice: 349,
    perBedroom: 70,
    perBathroom: 40,
    features: SERVICE_CHECKLIST,
  },
];
