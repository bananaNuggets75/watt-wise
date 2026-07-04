/**
 * Route for the AI recommendation engine.
 *
 *   POST /api/recommendations
 *     Body (JSON): an EnergyProfile. Required: accountName, kwhUsed,
 *     amount. Optional: peerAverageKwh, baselineKwh, eveningUsageSharePct,
 *     appliances[]. Returns the health score + prioritised recommendations.
 *
 * The route only validates and delegates — all analysis lives in the
 * engine, obtained via the factory so the provider can change without
 * touching this file.
 */

import { Router } from "express";
import { getRecommendationEngine } from "../engine/index.js";
import type { EnergyProfile } from "../types/recommendation.js";

export const recommendationsRouter = Router();

/**
 * Validate and normalise the JSON body into an EnergyProfile. Returns the
 * profile or a list of human-readable errors for a 400 response.
 */
function parseProfile(body: Record<string, unknown>): {
  profile?: EnergyProfile;
  errors: string[];
} {
  const errors: string[] = [];

  const accountName = String(body.accountName ?? "").trim();
  const kwhUsed = Number(body.kwhUsed);
  const amount = Number(body.amount);

  if (!accountName) errors.push("accountName is required");
  if (!Number.isFinite(kwhUsed) || kwhUsed < 0)
    errors.push("kwhUsed must be a non-negative number");
  if (!Number.isFinite(amount) || amount < 0)
    errors.push("amount must be a non-negative number");

  if (errors.length > 0) return { errors };

  // Optional numeric fields: pass through only when a valid number is given.
  const optionalNumber = (v: unknown): number | undefined => {
    const n = Number(v);
    return v !== undefined && v !== null && v !== "" && Number.isFinite(n)
      ? n
      : undefined;
  };

  const profile: EnergyProfile = {
    accountName,
    kwhUsed,
    amount,
    peerAverageKwh: optionalNumber(body.peerAverageKwh),
    baselineKwh: optionalNumber(body.baselineKwh),
    eveningUsageSharePct: optionalNumber(body.eveningUsageSharePct),
    // Appliances are passed through as-is when an array is provided; the
    // engine treats every field beyond `type`/`count` as optional.
    appliances: Array.isArray(body.appliances)
      ? (body.appliances as EnergyProfile["appliances"])
      : undefined,
  };

  return { profile, errors: [] };
}

/** POST /api/recommendations — score a profile and return recommendations. */
recommendationsRouter.post("/", async (req, res) => {
  const { profile, errors } = parseProfile(req.body ?? {});
  if (!profile) {
    return res.status(400).json({ error: "VALIDATION_FAILED", details: errors });
  }

  const engine = getRecommendationEngine();
  const result = await engine.generate(profile);

  // Report which engine produced the result (rule-based-v1 for now).
  return res.json({ engine: engine.name, ...result });
});
