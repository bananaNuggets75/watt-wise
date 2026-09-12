/**
 * Resolve `:establishmentId` and confirm the caller owns it.
 *
 * Bills and appliances hang off an establishment, so every one of their
 * routes needs the same two answers first: does this establishment exist,
 * and is it this user's? Doing it once here means the handlers can assume
 * both, and that a foreign id fails as a clean 404 rather than surfacing
 * later as a foreign-key error on insert or an empty list on read.
 *
 * Missing and someone-else's are answered identically, because the database
 * already makes them identical — RLS filters another account's row out of
 * the query, so there is nothing here to distinguish. That is the desirable
 * behaviour anyway: a 403 would confirm the id belongs to somebody.
 */

import type { NextFunction, Request, Response } from "express";
import { isUuid } from "../lib/uuid.js";
import { getEstablishment } from "../store/establishmentStore.js";
import { respondToStoreError } from "../routes/storeErrors.js";
import type { Establishment } from "../types/establishment.js";

// Make `req.establishment` known to TypeScript across the app.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** The establishment named in the path, once ownership is confirmed. */
      establishment?: Establishment;
    }
  }
}

/** The 404 body, shared so both paths to it read the same. */
const NOT_FOUND = {
  error: "ESTABLISHMENT_NOT_FOUND",
  message: "No such establishment.",
};

export async function requireEstablishment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const id = req.params.establishmentId;

  // Reject a malformed id before it reaches Postgres, which would raise
  // "invalid input syntax for type uuid" and read as a server fault.
  if (!isUuid(id)) {
    res.status(404).json(NOT_FOUND);
    return;
  }

  try {
    const establishment = await getEstablishment(req.accessToken!, id);
    if (!establishment) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    req.establishment = establishment;
    next();
  } catch (err) {
    respondToStoreError(err, res, next, {
      source: "establishments",
      staleReference: "that establishment no longer exists",
      notPermitted: "That establishment isn't yours.",
    });
  }
}
