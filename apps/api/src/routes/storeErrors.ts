/**
 * Translating a store failure into a response.
 *
 * Postgres reports two things this API must not pass on as a 500, because
 * neither is a server fault:
 *
 *   - a foreign-key violation means the caller sent an id that no longer
 *     resolves — a stale dropdown, usually — which is a 400;
 *   - a row-level-security refusal means the caller doesn't own the row they
 *     aimed at, which is a 403.
 *
 * Everything else is genuinely ours, and is logged and reported as a 502 so
 * the reason stays on the server rather than reaching the client.
 *
 * The wording differs per resource ("that type no longer exists" vs "that
 * appliance kind no longer exists"), so each router supplies its own; the
 * mapping from cause to status is what is shared.
 */

import type { NextFunction, Response } from "express";
import { DatabaseError, SupabaseNotConfiguredError } from "../store/supabaseClient.js";

export interface StoreErrorMessages {
  /** Log prefix identifying the router, e.g. "bills". */
  source: string;
  /** Explains a foreign key that didn't resolve, in the caller's terms. */
  staleReference: string;
  /** Explains an RLS refusal, in the caller's terms. */
  notPermitted: string;
}

/**
 * Respond to a store failure.
 *
 * Anything that isn't a store error is a genuine bug, and is handed to the
 * central error handler via `next` rather than rethrown: every caller here
 * is an async handler, where a throw becomes an unhandled rejection that
 * Express never sees — so the client would wait out its timeout instead of
 * getting the 500 it deserves.
 */
export function respondToStoreError(
  err: unknown,
  res: Response,
  next: NextFunction,
  messages: StoreErrorMessages,
): void {
  // Reached when the settings vanish between the guard and the query — rare,
  // but it would otherwise surface as an opaque 500.
  if (err instanceof SupabaseNotConfiguredError) {
    res.status(503).json({
      error: "DATABASE_NOT_CONFIGURED",
      message: "The server can't reach the database.",
    });
    return;
  }

  if (err instanceof DatabaseError) {
    if (/foreign key|violates foreign key constraint/i.test(err.message)) {
      res.status(400).json({ error: "VALIDATION_FAILED", details: [messages.staleReference] });
      return;
    }
    if (/row-level security/i.test(err.message)) {
      res.status(403).json({ error: "NOT_PERMITTED", message: messages.notPermitted });
      return;
    }
    console.error(`[${messages.source}] database error:`, err.message);
    res.status(502).json({ error: "DATABASE_ERROR", message: "Couldn't reach the database." });
    return;
  }

  next(err);
}
