/**
 * Routes for the appliance survey.
 *
 *   POST   /api/appliances      Save survey entries. Accepts one appliance or
 *                               an array (the form adds several, then submits).
 *   GET    /api/appliances      List the user's appliances; ?accountId= filters.
 *   DELETE /api/appliances/:id  Remove one of the user's entries.
 *
 * All routes require authentication and are scoped to req.user.
 */

import { Router } from "express";
import {
  createAppliance,
  deleteAppliance,
  listAppliances,
} from "../store/applianceStore.js";
import { requireAuth } from "../middleware/requireAuth.js";
import type { ApplianceSurveyInput } from "../types/appliance.js";

export const appliancesRouter = Router();

// Survey entries are per-user data, so every route here requires a session.
appliancesRouter.use(requireAuth);

/**
 * Placeholder account used when the client doesn't supply one. Auth and the
 * account picker don't exist yet, so survey entries land here and can be
 * reassigned later — the same approach as the placeholder user_id in
 * supabase/schema.sql.
 */
const UNASSIGNED_ACCOUNT_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Validate one appliance from the request body. Returns the parsed input, or
 * errors prefixed with the row's position so the client can point at the
 * offending card in the survey.
 */
function parseAppliance(
  body: Record<string, unknown>,
  index: number,
): { input?: ApplianceSurveyInput; errors: string[] } {
  const errors: string[] = [];
  const at = `appliance ${index + 1}:`;

  const type = String(body.type ?? "").trim();
  if (!type) errors.push(`${at} type is required`);

  // Default to 1 — the survey's counter starts there.
  const count = body.count === undefined ? 1 : Number(body.count);
  if (!Number.isInteger(count) || count < 1) {
    errors.push(`${at} count must be a whole number of at least 1`);
  }

  // Optional: only validate when the user actually answered.
  let ageYears: number | undefined;
  if (body.ageYears !== undefined && body.ageYears !== null && body.ageYears !== "") {
    ageYears = Number(body.ageYears);
    if (!Number.isFinite(ageYears) || ageYears < 0) {
      errors.push(`${at} ageYears must be a non-negative number`);
    }
  }

  const isInverter =
    typeof body.isInverter === "boolean" ? body.isInverter : undefined;

  if (errors.length > 0) return { errors };

  return {
    input: {
      accountId: String(body.accountId ?? "").trim() || UNASSIGNED_ACCOUNT_ID,
      type,
      count,
      isInverter,
      ageYears,
    },
    errors: [],
  };
}

/** POST /api/appliances — save one appliance or a whole survey. */
appliancesRouter.post("/", (req, res) => {
  // Accept either a single object or an array so the survey can submit in one
  // request; normalise to an array either way.
  const payload = Array.isArray(req.body) ? req.body : [req.body ?? {}];
  if (payload.length === 0) {
    return res.status(400).json({ error: "VALIDATION_FAILED", details: ["no appliances submitted"] });
  }

  // Validate everything first so a bad row doesn't leave a half-saved survey.
  const parsed: ApplianceSurveyInput[] = [];
  const errors: string[] = [];
  payload.forEach((row, index) => {
    const result = parseAppliance(row ?? {}, index);
    if (result.input) parsed.push(result.input);
    else errors.push(...result.errors);
  });

  if (errors.length > 0) {
    return res.status(400).json({ error: "VALIDATION_FAILED", details: errors });
  }

  const saved = parsed.map((input) => createAppliance(req.user!.id, input));
  return res.status(201).json(saved);
});

/** GET /api/appliances — list all, or just one account's with ?accountId=. */
appliancesRouter.get("/", (req, res) => {
  const accountId =
    typeof req.query.accountId === "string" ? req.query.accountId : undefined;
  res.json(listAppliances(req.user!.id, accountId));
});

/** DELETE /api/appliances/:id — remove one entry, or 404. */
appliancesRouter.delete("/:id", (req, res) => {
  if (!deleteAppliance(req.user!.id, req.params.id)) {
    return res.status(404).json({ error: "APPLIANCE_NOT_FOUND" });
  }
  return res.status(204).end();
});
