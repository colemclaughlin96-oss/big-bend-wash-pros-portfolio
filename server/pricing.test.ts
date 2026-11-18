import { describe, expect, it } from "vitest";
import {
  computeTierPrice,
  computeTiers,
  round2,
  DEFAULT_TIERS,
  type PricingTier,
} from "../shared/pricing";

// Default template tier used as the baseline for the additive-engine tests.
// (Big Bend Wash Pros template: "Driveway & Walkway" — base 149, +25/+20.)
const driveway = DEFAULT_TIERS.find((t) => t.key === "driveway")!;

describe("computeTierPrice", () => {
  it("applies base + perInputA + perInputB", () => {
    // driveway: 149 + 3*25 + 2*20 = 264
    expect(computeTierPrice(driveway, { bedrooms: 3, bathrooms: 2 })).toBe(264);
  });

  it("handles a zero-size property (base only)", () => {
    expect(computeTierPrice(driveway, { bedrooms: 0, bathrooms: 0 })).toBe(149);
  });

  it("treats non-finite inputs as 0", () => {
    expect(computeTierPrice(driveway, { bedrooms: NaN, bathrooms: NaN })).toBe(149);
  });

  it("treats negative inputs as 0", () => {
    expect(computeTierPrice(driveway, { bedrooms: -5, bathrooms: -2 })).toBe(149);
  });

  it("supports fractional per-unit rates with 2-decimal rounding", () => {
    const frac: PricingTier = { ...driveway, basePrice: 140, perBedroom: 35, perBathroom: 32.5 };
    // 140 + 3*35 + 2*32.5 = 310
    expect(computeTierPrice(frac, { bedrooms: 3, bathrooms: 2 })).toBe(310);
  });

  it("never returns negative even if base is negative", () => {
    const weird: PricingTier = { ...driveway, basePrice: -1000, perBedroom: 0, perBathroom: 0 };
    expect(computeTierPrice(weird, { bedrooms: 1, bathrooms: 1 })).toBe(0);
  });
});

describe("computeTiers", () => {
  it("computes all four default packages for a 3 / 2 property", () => {
    const tiers = computeTiers(DEFAULT_TIERS, { bedrooms: 3, bathrooms: 2 });
    expect(tiers).toHaveLength(4);
    expect(tiers.map((t) => t.key)).toEqual([
      "driveway",
      "housewash",
      "fullexterior",
      "roofwash",
    ]);
    // driveway:     149 + 3*25 + 2*20 = 264
    // housewash:    249 + 3*60 + 2*30 = 489
    // fullexterior: 399 + 3*80 + 2*45 = 729
    // roofwash:     349 + 3*70 + 2*40 = 639
    expect(tiers[0].total).toBe(264);
    expect(tiers[1].total).toBe(489);
    expect(tiers[2].total).toBe(729);
    expect(tiers[3].total).toBe(639);
    // House Soft Wash is the highlighted / most-popular package
    expect(tiers[1].highlighted).toBe(true);
  });

  it("preserves custom package names and features", () => {
    const custom: PricingTier[] = [
      { key: "a", name: "Bronze", description: "", basePrice: 100, perBedroom: 0, perBathroom: 0, features: ["x"] },
      { key: "b", name: "Platinum", description: "", basePrice: 200, perBedroom: 10, perBathroom: 5, features: ["x", "y"] },
    ];
    const tiers = computeTiers(custom, { bedrooms: 4, bathrooms: 2 });
    expect(tiers[0].name).toBe("Bronze");
    expect(tiers[0].total).toBe(100);
    expect(tiers[1].name).toBe("Platinum");
    // 200 + 4*10 + 2*5 = 250
    expect(tiers[1].total).toBe(250);
    expect(tiers[1].features).toEqual(["x", "y"]);
  });

  it("round2 keeps two decimals", () => {
    expect(round2(310.005)).toBe(310.01);
    expect(round2(280)).toBe(280);
  });
});
