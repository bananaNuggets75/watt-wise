/**
 * Rule-based recommendation engine (v1).
 *
 * Deterministic, dependency-free, and instant: it scores an energy profile
 * and emits "Priority Actions" from a small set of transparent rules. Each
 * rule both (a) may add a recommendation and (b) deducts from a starting
 * health score of 100. This is the current implementation of the
 * RecommendationEngine interface; a hosted LLM can replace it later.
 */

import type { RecommendationEngine } from "./recommendationEngine.js";
import type {
  EnergyProfile,
  ImpactLevel,
  Recommendation,
  RecommendationResult,
} from "../types/recommendation.js";

// --- Tunable thresholds --------------------------------------------------
// Kept together so they're easy to review and adjust. If a profile omits a
// benchmark we assume an average cafe (matches the mockup's 265 kWh figure).
const DEFAULT_PEER_AVERAGE_KWH = 265;
const ABOVE_PEER_PCT = 10; // % over peers before we flag it
const HIGH_IMPACT_ABOVE_PEER_PCT = 25; // % over peers that is "high" impact
const EVENING_SHARE_PCT = 30; // evening-peak share considered high
const BASELINE_SHARE_PCT = 15; // idle draw as % of total considered high
const OLD_APPLIANCE_YEARS = 8; // age at which an appliance is "aging"

/** Impact ranking used to sort recommendations most-impactful first. */
const IMPACT_ORDER: Record<ImpactLevel, number> = { high: 0, medium: 1, low: 2 };

/** Clamp a number into an inclusive range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Round to a whole number for scores/percentages we show to users. */
function round(value: number): number {
  return Math.round(value);
}

export const ruleBasedEngine: RecommendationEngine = {
  name: "rule-based-v1",

  async generate(profile: EnergyProfile): Promise<RecommendationResult> {
    const peerAverageKwh = profile.peerAverageKwh ?? DEFAULT_PEER_AVERAGE_KWH;
    const recommendations: Recommendation[] = [];

    // Health score starts perfect and each triggered rule chips away at it.
    let score = 100;

    // How far above/below peers this account sits, as a percentage.
    const deltaPct =
      peerAverageKwh > 0
        ? round(((profile.kwhUsed - peerAverageKwh) / peerAverageKwh) * 100)
        : 0;

    // --- Rule 1: consumption vs peers ------------------------------------
    if (deltaPct > ABOVE_PEER_PCT) {
      const impact: ImpactLevel =
        deltaPct >= HIGH_IMPACT_ABOVE_PEER_PCT ? "high" : "medium";
      recommendations.push({
        id: "high-vs-peers",
        title: "Your usage is higher than similar accounts",
        description: `You consume about ${deltaPct}% more electricity than similar accounts (${peerAverageKwh} kWh average). Small efficiency changes can close most of this gap.`,
        impact,
        category: "benchmark",
      });
      // Penalise proportionally to how far over peers, capped so one rule
      // can't sink the whole score.
      score -= clamp(deltaPct, 0, 30);
    }

    // --- Rule 2: evening-peak usage --------------------------------------
    if (
      profile.eveningUsageSharePct !== undefined &&
      profile.eveningUsageSharePct > EVENING_SHARE_PCT
    ) {
      recommendations.push({
        id: "high-evening-usage",
        title: "Your evening usage is high",
        description: `Around ${round(profile.eveningUsageSharePct)}% of your usage falls in the 6-10PM peak. Shifting heavy loads (cooling, laundry) outside those hours can lower costs.`,
        impact: "high",
        category: "usage",
      });
      score -= 12;
    }

    // --- Rule 3: baseline / idle draw ------------------------------------
    if (profile.baselineKwh !== undefined && profile.kwhUsed > 0) {
      const baselineSharePct = (profile.baselineKwh / profile.kwhUsed) * 100;
      if (baselineSharePct > BASELINE_SHARE_PCT) {
        recommendations.push({
          id: "high-baseline",
          title: "Baseline consumption is consistently high",
          description: `About ${round(baselineSharePct)}% of your usage is idle/overnight draw. Check for appliances that can be fully unplugged when closed.`,
          impact: "medium",
          category: "baseline",
        });
        score -= 10;
      }
    }

    // --- Rule 4: non-inverter appliances ---------------------------------
    const nonInverter = (profile.appliances ?? []).filter(
      (a) => a.isInverter === false,
    );
    if (nonInverter.length > 0) {
      const types = [...new Set(nonInverter.map((a) => a.type))].join(", ");
      recommendations.push({
        id: "non-inverter-appliances",
        title: "Non-inverter appliances may be driving up costs",
        description: `Your non-inverter units (${types}) add extra baseline draw. Replacing them with inverter models can significantly cut daily consumption.`,
        impact: "medium",
        category: "appliances",
      });
      score -= 8;
    }

    // --- Rule 5: aging appliances ----------------------------------------
    const aging = (profile.appliances ?? []).filter(
      (a) => (a.ageYears ?? 0) >= OLD_APPLIANCE_YEARS,
    );
    if (aging.length > 0) {
      const types = [...new Set(aging.map((a) => a.type))].join(", ");
      recommendations.push({
        id: "aging-appliances",
        title: "Some appliances are aging",
        description: `Older units (${types}) tend to run less efficiently. Servicing or upgrading them can trim wasted energy.`,
        impact: "low",
        category: "appliances",
      });
      score -= 5;
    }

    // Finalise the score and map it to a friendly band.
    const healthScore = clamp(round(score), 0, 100);
    const healthLabel =
      healthScore >= 70 ? "Good" : healthScore >= 40 ? "Fair" : "Poor";

    // Sort so the highest-impact actions surface first.
    recommendations.sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact]);

    return {
      accountName: profile.accountName,
      healthScore,
      healthLabel,
      benchmark: { peerAverageKwh, deltaPct },
      recommendations,
    };
  },
};
