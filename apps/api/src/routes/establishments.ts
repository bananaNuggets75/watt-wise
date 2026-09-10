/**
 * Routes for the establishment survey shown straight after registration,
 * and the mounting point for everything an establishment owns.
 *
 *   GET  /api/establishments/types      The establishment types to choose from.
 *   GET  /api/establishments/providers  The electric utilities to choose from.
 *   POST /api/establishments            Create the user's establishment.
 *   GET  /api/establishments            List the user's establishments.
 *   .../:establishmentId/bills          Bills recorded for one establishment.
 *   .../:establishmentId/appliances     The establishment's appliance survey.
 *
 * All routes require authentication. The two lookup lists are shared
 * reference data rather than user data, but they still sit behind auth
 * because their RLS policies only grant `select` to the authenticated role.
 */

import { Router } from "express";
import { isUuid } from "../lib/uuid.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireDatabase } from "../middleware/requireDatabase.js";
import { requireEstablishment } from "../middleware/requireEstablishment.js";
import { appliancesRouter } from "./appliances.js";
import { billsRouter } from "./bills.js";
import {
  createEstablishment,
  listEstablishments,
  listEstablishmentTypes,
  listProviders,
} from "../store/establishmentStore.js";
import { respondToStoreError, type StoreErrorMessages } from "./storeErrors.js";
import type { EstablishmentInput } from "../types/establishment.js";

export const establishmentsRouter = Router();

establishmentsRouter.use(requireAuth);
establishmentsRouter.use(requireDatabase);

/**
 * Everything an establishment owns hangs off it in the URL, matching how it
 * hangs off it in the schema. requireEstablishment resolves the id once, so
 * the sub-routers can take ownership as given — and auth and the database
 * guard above already apply to them, since they run on this router first.
 */
establishmentsRouter.use("/:establishmentId/bills", requireEstablishment, billsRouter);
establishmentsRouter.use(
  "/:establishmentId/appliances",
  requireEstablishment,
  appliancesRouter,
);

/** How a database failure reads to someone filling in the survey. */
const ERRORS: StoreErrorMessages = {
  source: "establishments",
  staleReference: "that type or electric utility no longer exists",
  notPermitted: "You can't save an establishment for another account.",
};

/**
 * Validate the survey body. Messages name the field as the form labels it,
 * so the client can show them without translating.
 */
function parseEstablishment(
  body: Record<string, unknown>,
): { input?: EstablishmentInput; errors: string[] } {
  const errors: string[] = [];

  const name = String(body.name ?? "").trim();
  if (!name) errors.push("name is required");

  const typeId = String(body.typeId ?? "").trim();
  if (!typeId) errors.push("type is required");
  else if (!isUuid(typeId)) errors.push("type is not a valid selection");

  const providerId = String(body.providerId ?? "").trim();
  if (!providerId) errors.push("electric utility is required");
  else if (!isUuid(providerId)) {
    errors.push("electric utility is not a valid selection");
  }

  // Optional: absent and blank are the same thing here.
  const address = String(body.address ?? "").trim();

  if (errors.length > 0) return { errors };

  return {
    input: { name, typeId, providerId, address: address || undefined },
    errors: [],
  };
}

/** GET /api/establishments/types — the seeded establishment types. */
establishmentsRouter.get("/types", async (req, res, next) => {
  try {
    res.json(await listEstablishmentTypes(req.accessToken!));
  } catch (err) {
    respondToStoreError(err, res, next, ERRORS);
  }
});

/** GET /api/establishments/providers — the electric utilities on offer. */
establishmentsRouter.get("/providers", async (req, res, next) => {
  try {
    res.json(await listProviders(req.accessToken!));
  } catch (err) {
    respondToStoreError(err, res, next, ERRORS);
  }
});

/** POST /api/establishments — create the signed-in user's establishment. */
establishmentsRouter.post("/", async (req, res, next) => {
  const { input, errors } = parseEstablishment(req.body ?? {});
  if (!input) {
    return res.status(400).json({ error: "VALIDATION_FAILED", details: errors });
  }

  try {
    // The owner comes from the verified token, never from the body.
    const saved = await createEstablishment(req.accessToken!, req.user!.id, input);
    return res.status(201).json(saved);
  } catch (err) {
    return respondToStoreError(err, res, next, ERRORS);
  }
});

/** GET /api/establishments — the user's own establishments, newest first. */
establishmentsRouter.get("/", async (req, res, next) => {
  try {
    res.json(await listEstablishments(req.accessToken!));
  } catch (err) {
    respondToStoreError(err, res, next, ERRORS);
  }
});
