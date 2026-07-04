/**
 * The seam that keeps WattWise provider-agnostic.
 *
 * Everything in the app talks to a RecommendationEngine, never to a
 * specific implementation. v1 ships a rule-based engine; when the team
 * picks a hosted LLM (Gemini / OpenAI), that becomes a new class
 * implementing this same interface — and nothing else has to change.
 *
 * `generate` is async on purpose: the rule-based engine returns
 * immediately, but an LLM-backed one will make a network call.
 */

import type { EnergyProfile, RecommendationResult } from "../types/recommendation.js";

export interface RecommendationEngine {
  /** Identifies which engine produced a result (useful for debugging/telemetry). */
  readonly name: string;

  /** Analyse an energy profile and return a score + recommendations. */
  generate(profile: EnergyProfile): Promise<RecommendationResult>;
}
