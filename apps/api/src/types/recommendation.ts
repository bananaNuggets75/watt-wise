/**
 * Domain types for the AI recommendation engine (v1).
 *
 * The engine takes an "energy profile" (what we know about an account's
 * consumption and appliances) and returns an energy health score plus a
 * list of prioritised, actionable recommendations — the data behind the
 * "Health Score" and "Priority Actions" screens.
 *
 * v1 is rule-based, but these types are provider-neutral: a hosted LLM
 * (Gemini / OpenAI) can produce the exact same RecommendationResult later.
 */

/** How much impact acting on a recommendation is expected to have. */
export type ImpactLevel = "high" | "medium" | "low";

/** One appliance the account uses. Fields beyond count are optional so a
 *  profile still works before the appliance survey is filled in. */
export interface ApplianceInput {
  /** e.g. "Air Conditioner", "Television", "Refrigerator". */
  type: string;
  /** How many of this appliance are in use. */
  count: number;
  /** Whether it's an inverter model (relevant for AC / fridge efficiency). */
  isInverter?: boolean;
  /** Approximate age in years (older units tend to be less efficient). */
  ageYears?: number;
}

/** Everything the engine reasons over for one account/period. Only the
 *  first three fields are required; the rest sharpen the analysis when
 *  available and otherwise fall back to sensible defaults. */
export interface EnergyProfile {
  /** Account / location name, e.g. "Cafe Marie". */
  accountName: string;
  /** Total energy consumed this period, in kWh. */
  kwhUsed: number;
  /** Total amount billed this period (local currency). */
  amount: number;
  /** Benchmark: average kWh for similar accounts. Defaults if omitted. */
  peerAverageKwh?: number;
  /** Idle/overnight draw in kWh, if known (used to spot standby waste). */
  baselineKwh?: number;
  /** Share of usage during the evening peak (6-10PM), as a percentage. */
  eveningUsageSharePct?: number;
  /** The account's appliances, if the survey has been completed. */
  appliances?: ApplianceInput[];
}

/** A single prioritised recommendation shown in "Priority Actions". */
export interface Recommendation {
  /** Stable slug so clients can track dismiss/acted state, e.g. "high-vs-peers". */
  id: string;
  /** Short headline, e.g. "Your usage is higher than similar cafes". */
  title: string;
  /** One or two sentences explaining the finding and the suggested action. */
  description: string;
  /** Expected payoff of acting on it. */
  impact: ImpactLevel;
  /** Grouping tag: "benchmark" | "usage" | "baseline" | "appliances". */
  category: string;
}

/** The engine's full output for one profile. */
export interface RecommendationResult {
  accountName: string;
  /** Energy health score, 0-100 (higher is better). */
  healthScore: number;
  /** Human label for the score band. */
  healthLabel: "Good" | "Fair" | "Poor";
  /** How this account compares to its peer benchmark. */
  benchmark: {
    peerAverageKwh: number;
    /** Percent difference vs peers; +18 means 18% above average. */
    deltaPct: number;
  };
  /** Prioritised recommendations, most impactful first. */
  recommendations: Recommendation[];
}
