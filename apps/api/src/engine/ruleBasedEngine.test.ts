/**
 * Unit tests for the rule-based recommendation engine.
 *
 * The engine is the product's actual judgement — what it tells a user to do
 * about their electricity — so these tests pin down each rule's trigger
 * boundary, the score arithmetic, and the ordering the Priority Actions
 * screen relies on.
 */

import { describe, expect, it } from "vitest";
import { ruleBasedEngine } from "./ruleBasedEngine.js";
import type { EnergyProfile } from "../types/recommendation.js";

/** A profile that triggers nothing, so each test can turn on one rule. */
function baseProfile(overrides: Partial<EnergyProfile> = {}): EnergyProfile {
  return {
    accountName: "Cafe Marie",
    // Equal to the default peer average, so the benchmark rule stays quiet.
    kwhUsed: 265,
    amount: 1500,
    ...overrides,
  };
}

/** Ids of the recommendations returned, for concise assertions. */
async function ruleIds(profile: EnergyProfile): Promise<string[]> {
  const result = await ruleBasedEngine.generate(profile);
  return result.recommendations.map((r) => r.id);
}

describe("a profile with nothing wrong", () => {
  it("scores 100 and recommends nothing", async () => {
    const result = await ruleBasedEngine.generate(baseProfile());

    expect(result.healthScore).toBe(100);
    expect(result.healthLabel).toBe("Good");
    expect(result.recommendations).toEqual([]);
  });

  it("reports the peer benchmark it compared against", async () => {
    const result = await ruleBasedEngine.generate(baseProfile({ kwhUsed: 180 }));

    expect(result.benchmark.peerAverageKwh).toBe(265);
    // 180 vs 265 is about 32% below.
    expect(result.benchmark.deltaPct).toBe(-32);
  });

  it("passes the account name through for display", async () => {
    const result = await ruleBasedEngine.generate(baseProfile({ accountName: "Bob Diner" }));
    expect(result.accountName).toBe("Bob Diner");
  });
});

describe("usage vs peers", () => {
  it("stays quiet at or just above the peer average", async () => {
    // 10% over is the threshold; it must be exceeded, not merely met.
    expect(await ruleIds(baseProfile({ kwhUsed: 265 * 1.1 }))).not.toContain("high-vs-peers");
  });

  it("flags usage above the threshold", async () => {
    expect(await ruleIds(baseProfile({ kwhUsed: 312 }))).toContain("high-vs-peers");
  });

  it("is medium impact when moderately above peers", async () => {
    const [rec] = (await ruleBasedEngine.generate(baseProfile({ kwhUsed: 312 }))).recommendations;
    expect(rec.impact).toBe("medium");
  });

  it("escalates to high impact at 25% or more above peers", async () => {
    const result = await ruleBasedEngine.generate(baseProfile({ kwhUsed: 265 * 1.3 }));
    const rec = result.recommendations.find((r) => r.id === "high-vs-peers");
    expect(rec?.impact).toBe("high");
  });

  it("uses a supplied peer average instead of the default", async () => {
    // 312 is below this average, so the rule must not fire.
    const result = await ruleBasedEngine.generate(
      baseProfile({ kwhUsed: 312, peerAverageKwh: 400 }),
    );

    expect(result.benchmark.peerAverageKwh).toBe(400);
    expect(result.recommendations.map((r) => r.id)).not.toContain("high-vs-peers");
  });

  it("does not divide by zero when the peer average is zero", async () => {
    const result = await ruleBasedEngine.generate(
      baseProfile({ kwhUsed: 312, peerAverageKwh: 0 }),
    );
    expect(result.benchmark.deltaPct).toBe(0);
    expect(Number.isFinite(result.healthScore)).toBe(true);
  });
});

describe("evening peak usage", () => {
  it("is not evaluated when the share is unknown", async () => {
    expect(await ruleIds(baseProfile())).not.toContain("high-evening-usage");
  });

  it("stays quiet at the 30% threshold", async () => {
    expect(await ruleIds(baseProfile({ eveningUsageSharePct: 30 }))).not.toContain(
      "high-evening-usage",
    );
  });

  it("flags a share above the threshold as high impact", async () => {
    const result = await ruleBasedEngine.generate(baseProfile({ eveningUsageSharePct: 38 }));
    const rec = result.recommendations.find((r) => r.id === "high-evening-usage");

    expect(rec).toBeDefined();
    expect(rec?.impact).toBe("high");
    // The user is told their own number, not a generic sentence.
    expect(rec?.description).toContain("38%");
  });
});

describe("baseline (idle) draw", () => {
  it("is not evaluated when the baseline is unknown", async () => {
    expect(await ruleIds(baseProfile())).not.toContain("high-baseline");
  });

  it("flags a baseline over 15% of total usage", async () => {
    // 60 of 265 kWh is ~23%.
    expect(await ruleIds(baseProfile({ baselineKwh: 60 }))).toContain("high-baseline");
  });

  it("stays quiet for a modest baseline", async () => {
    // 26 of 265 kWh is ~10%.
    expect(await ruleIds(baseProfile({ baselineKwh: 26 }))).not.toContain("high-baseline");
  });

  it("does not divide by zero when no energy was used", async () => {
    const result = await ruleBasedEngine.generate(
      baseProfile({ kwhUsed: 0, baselineKwh: 10 }),
    );
    expect(result.recommendations.map((r) => r.id)).not.toContain("high-baseline");
    expect(Number.isFinite(result.healthScore)).toBe(true);
  });
});

describe("appliance rules", () => {
  it("flags non-inverter units and names them", async () => {
    const result = await ruleBasedEngine.generate(
      baseProfile({
        appliances: [{ type: "Air Conditioner", count: 2, isInverter: false }],
      }),
    );
    const rec = result.recommendations.find((r) => r.id === "non-inverter-appliances");

    expect(rec).toBeDefined();
    expect(rec?.description).toContain("Air Conditioner");
  });

  it("ignores appliances whose inverter status is unknown", async () => {
    // undefined must not be treated as "not an inverter".
    expect(
      await ruleIds(baseProfile({ appliances: [{ type: "Television", count: 1 }] })),
    ).not.toContain("non-inverter-appliances");
  });

  it("flags units aged 8 years or more", async () => {
    expect(
      await ruleIds(baseProfile({ appliances: [{ type: "Refrigerator", count: 1, ageYears: 8 }] })),
    ).toContain("aging-appliances");
  });

  it("leaves newer units alone", async () => {
    expect(
      await ruleIds(baseProfile({ appliances: [{ type: "Refrigerator", count: 1, ageYears: 3 }] })),
    ).not.toContain("aging-appliances");
  });

  it("lists each appliance type once, however many entries there are", async () => {
    const result = await ruleBasedEngine.generate(
      baseProfile({
        appliances: [
          { type: "Air Conditioner", count: 1, isInverter: false },
          { type: "Air Conditioner", count: 2, isInverter: false },
        ],
      }),
    );
    const rec = result.recommendations.find((r) => r.id === "non-inverter-appliances");

    expect(rec?.description.match(/Air Conditioner/g)).toHaveLength(1);
  });
});

describe("scoring", () => {
  it("labels a mildly affected profile Fair", async () => {
    const result = await ruleBasedEngine.generate(baseProfile({ eveningUsageSharePct: 38 }));
    // 100 - 12 for the evening rule.
    expect(result.healthScore).toBe(88);
    expect(result.healthLabel).toBe("Good");
  });

  it("drops the label as problems accumulate", async () => {
    const result = await ruleBasedEngine.generate(
      baseProfile({
        kwhUsed: 312,
        baselineKwh: 60,
        eveningUsageSharePct: 38,
        appliances: [{ type: "Air Conditioner", count: 2, isInverter: false, ageYears: 9 }],
      }),
    );

    expect(result.healthScore).toBeLessThan(70);
    expect(result.healthLabel).toBe("Fair");
  });

  it("never falls below zero, however bad the profile", async () => {
    const result = await ruleBasedEngine.generate(
      baseProfile({
        kwhUsed: 265 * 10, // wildly above peers
        baselineKwh: 265 * 9,
        eveningUsageSharePct: 90,
        appliances: [
          { type: "Air Conditioner", count: 5, isInverter: false, ageYears: 20 },
          { type: "Refrigerator", count: 3, isInverter: false, ageYears: 15 },
        ],
      }),
    );

    expect(result.healthScore).toBeGreaterThanOrEqual(0);
    expect(result.healthLabel).toBe("Poor");
  });

  it("caps how far one rule can drag the score down", async () => {
    // The peer rule is capped at 30 points no matter how far above average.
    const result = await ruleBasedEngine.generate(baseProfile({ kwhUsed: 265 * 100 }));
    expect(result.healthScore).toBe(70);
  });
});

describe("ordering", () => {
  it("returns recommendations most impactful first", async () => {
    const result = await ruleBasedEngine.generate(
      baseProfile({
        kwhUsed: 312, // medium
        eveningUsageSharePct: 38, // high
        appliances: [{ type: "Air Conditioner", count: 1, isInverter: false, ageYears: 9 }], // medium + low
      }),
    );

    const impacts = result.recommendations.map((r) => r.impact);
    const rank = { high: 0, medium: 1, low: 2 } as const;
    const ranks = impacts.map((i) => rank[i]);

    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(impacts[0]).toBe("high");
  });
});

describe("engine identity", () => {
  it("reports which engine produced the result", () => {
    expect(ruleBasedEngine.name).toBe("rule-based-v1");
  });
});
