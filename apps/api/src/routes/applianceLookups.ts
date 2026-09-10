/**
 * The lists the appliance survey is built from.
 *
 *   GET /api/appliances/kinds              Air Conditioner, Lighting, ...
 *   GET /api/appliances/subtypes           Every variant, with its kind.
 *   GET /api/appliances/subtypes?kindId=   Just one kind's variants.
 *
 * Shared reference data, not an establishment's, so these sit outside the
 * establishment tree — the survey needs them before a place is chosen.
 * They still require a sign-in, because their RLS policies only grant
 * `select` to the authenticated role.
 *
 * Serving them from the API rather than having the browser read the tables
 * directly keeps one description of the survey's options: the same lists
 * the API validates against are the ones the form offers.
 */

import { Router } from "express";
import { isUuid } from "../lib/uuid.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireDatabase } from "../middleware/requireDatabase.js";
import {
  listApplianceKinds,
  listApplianceSubtypes,
} from "../store/applianceStore.js";
import { respondToStoreError, type StoreErrorMessages } from "./storeErrors.js";

export const applianceLookupsRouter = Router();

applianceLookupsRouter.use(requireAuth);
applianceLookupsRouter.use(requireDatabase);

const ERRORS: StoreErrorMessages = {
  source: "appliances",
  staleReference: "that appliance list is no longer available",
  notPermitted: "You can't read the appliance lists.",
};

/** GET /kinds — the appliance kinds the survey offers. */
applianceLookupsRouter.get("/kinds", async (req, res, next) => {
  try {
    res.json(await listApplianceKinds(req.accessToken!));
  } catch (err) {
    respondToStoreError(err, res, next, ERRORS);
  }
});

/**
 * GET /subtypes — every variant, or one kind's with ?kindId=.
 *
 * The unfiltered list is the useful one for the survey: it holds about a
 * dozen rows, so fetching it once lets the variant dropdown react to a
 * change of kind without another round trip.
 */
applianceLookupsRouter.get("/subtypes", async (req, res, next) => {
  const kindId = typeof req.query.kindId === "string" ? req.query.kindId : undefined;

  // A malformed filter can only be a client bug, and returning everything
  // would quietly look like it worked.
  if (kindId !== undefined && !isUuid(kindId)) {
    return res.status(400).json({
      error: "VALIDATION_FAILED",
      details: ["kindId is not a valid selection"],
    });
  }

  try {
    const subtypes = await listApplianceSubtypes(req.accessToken!);
    return res.json(kindId ? subtypes.filter((s) => s.kindId === kindId) : subtypes);
  } catch (err) {
    return respondToStoreError(err, res, next, ERRORS);
  }
});
