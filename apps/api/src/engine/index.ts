/**
 * Engine factory — the single place that decides which RecommendationEngine
 * the app uses.
 *
 * v1 always returns the rule-based engine (no API key, no cost). When the
 * team picks a hosted LLM, add the implementation and switch on an env var
 * here; callers (routes) keep calling getRecommendationEngine() and never
 * change. For example:
 *
 *   switch (process.env.AI_PROVIDER) {
 *     case "gemini": return geminiEngine;   // needs GEMINI_API_KEY
 *     case "openai": return openAiEngine;    // needs OPENAI_API_KEY
 *     default:       return ruleBasedEngine;
 *   }
 */

import type { RecommendationEngine } from "./recommendationEngine.js";
import { ruleBasedEngine } from "./ruleBasedEngine.js";

/** Return the active recommendation engine. */
export function getRecommendationEngine(): RecommendationEngine {
  // v1: rule-based only. LLM providers slot in here later (see note above).
  return ruleBasedEngine;
}

export type { RecommendationEngine } from "./recommendationEngine.js";
