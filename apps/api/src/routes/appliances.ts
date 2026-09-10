/**
 * Routes for one establishment's appliance survey.
 *
 *   POST   /api/establishments/:establishmentId/appliances      Save the survey.
 *   GET    /api/establishments/:establishmentId/appliances      List them.
 *   DELETE /api/establishments/:establishmentId/appliances/:id  Remove one.
 *
 * Mounted as a sub-router of the establishments router, so authentication,
 * the database guard and the ownership check have all run before anything
 * here does. `mergeParams` is what makes :establishmentId visible.
 *
 * The lists the survey is built from live in applianceLookups.ts — they are
 * shared reference data, needed before an establishment is chosen.
 */

import { Router } from "express";
import { isUuid } from "../lib/uuid.js";
import {
  createAppliances,
  deleteAppliance,
  listAppliances,
} from "../store/applianceStore.js";
import { respondToStoreError, type StoreErrorMessages } from "./storeErrors.js";
import type { ApplianceSurveyInput } from "../types/appliance.js";

export const appliancesRouter = Router({ mergeParams: true });

/**
 * How a database failure reads to someone filling in the survey. A foreign
 * key that doesn't resolve covers two cases here: a stale option list, and
 * a subtype paired with the wrong kind — the appliances_subtype_matches_kind
 * constraint reports that as a foreign-key violation too.
 */
const ERRORS: StoreErrorMessages = {
  source: "appliances",
  staleReference: "that appliance kind or variant no longer exists, or they don't go together",
  notPermitted: "You can't save appliances for another account's establishment.",
};

/**
 * Validate one appliance from the request body. Errors are prefixed with the
 * row's position so the client can point at the offending card in the survey.
 */
function parseAppliance(
  body: Record<string, unknown>,
  index: number,
): { input?: ApplianceSurveyInput; errors: string[] } {
  const errors: string[] = [];
  const at = `appliance ${index + 1}:`;

  const kindId = String(body.kindId ?? "").trim();
  if (!kindId) errors.push(`${at} kind is required`);
  else if (!isUuid(kindId)) errors.push(`${at} kind is not a valid selection`);

  // Optional: absent for a kind with no variants, or when the user skipped
  // the detail. Blank and absent mean the same thing.
  const subtypeId = String(body.subtypeId ?? "").trim();
  if (subtypeId && !isUuid(subtypeId)) {
    errors.push(`${at} variant is not a valid selection`);
  }

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

  if (errors.length > 0) return { errors };

  return {
    input: { kindId, subtypeId: subtypeId || undefined, count, ageYears },
    errors: [],
  };
}

/** POST — save one appliance or a whole survey against this establishment. */
appliancesRouter.post("/", async (req, res, next) => {
  // Accept either a single object or an array so the survey can submit in
  // one request; normalise to an array either way.
  const payload = Array.isArray(req.body) ? req.body : [req.body ?? {}];
  if (payload.length === 0) {
    return res
      .status(400)
      .json({ error: "VALIDATION_FAILED", details: ["no appliances submitted"] });
  }

  // Validate everything first: a bad row must not leave a half-saved survey
  // that tells the engine the user owns fewer appliances than they said.
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

  try {
    const saved = await createAppliances(req.accessToken!, req.establishment!.id, parsed);
    return res.status(201).json(saved);
  } catch (err) {
    return respondToStoreError(err, res, next, ERRORS);
  }
});

/** GET — this establishment's appliances, newest first. */
appliancesRouter.get("/", async (req, res, next) => {
  try {
    res.json(await listAppliances(req.accessToken!, req.establishment!.id));
  } catch (err) {
    respondToStoreError(err, res, next, ERRORS);
  }
});

/** DELETE /:id — remove one of this establishment's appliances, or 404. */
appliancesRouter.delete("/:id", async (req, res, next) => {
  // A malformed id would make Postgres raise rather than match no rows.
  if (!isUuid(req.params.id)) {
    return res.status(404).json({ error: "APPLIANCE_NOT_FOUND" });
  }

  try {
    const removed = await deleteAppliance(
      req.accessToken!,
      req.establishment!.id,
      req.params.id,
    );
    if (!removed) return res.status(404).json({ error: "APPLIANCE_NOT_FOUND" });
    return res.status(204).end();
  } catch (err) {
    return respondToStoreError(err, res, next, ERRORS);
  }
});
