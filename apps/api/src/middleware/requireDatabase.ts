/**
 * Refuse a request early when the API has no database to reach.
 *
 * This draws the same distinction requireAuth draws for SUPABASE_URL, and
 * for the same reason: a deployment that was never configured is the
 * operator's problem, not the caller's. Reporting it as a validation error
 * or an empty list sends whoever is debugging to look at their own request,
 * which is the wrong place entirely.
 */

import type { NextFunction, Request, Response } from "express";
import { isDatabaseConfigured } from "../store/supabaseClient.js";

export function requireDatabase(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isDatabaseConfigured()) {
    next();
    return;
  }

  console.error(
    "[db] SUPABASE_URL / SUPABASE_ANON_KEY are not set, so nothing can be " +
      "read or written. Set them in apps/api/.env and restart — dotenv reads " +
      "the file once at startup, so an already-running server won't pick up " +
      "a change.",
  );
  res.status(503).json({
    error: "DATABASE_NOT_CONFIGURED",
    message: "The server can't reach the database.",
  });
}
