/**
 * Authentication middleware.
 *
 * Rejects requests without a valid Supabase access token, and attaches the
 * verified user to the request so handlers can scope data to its owner.
 * Applying this is what stops one user's bills being readable by anyone who
 * asks.
 *
 * The user id here is the same uuid Postgres sees as auth.uid(), so the
 * scoping done in the handlers and the Row-Level Security policies in
 * supabase/migrations agree on who owns a row.
 */

import type { NextFunction, Request, Response } from "express";
import { isAuthConfigured, verifyAccessToken, type VerifiedUser } from "../auth/verifyToken.js";

// Make `req.user` known to TypeScript across the app.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: VerifiedUser;
    }
  }
}

/** Extract the bearer token from an Authorization header, if well-formed. */
function bearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length).trim() || undefined;
}

/**
 * Require a signed-in user. Responds 401 and stops the chain when the token
 * is missing, malformed, expired, or not signed by this Supabase project.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Distinguish "this deployment can't verify anyone" from "your token is no
  // good". Both reject the request, but only one is the caller's problem —
  // reporting a misconfiguration as "sign in" sends people to debug their
  // login when the actual fault is a missing SUPABASE_URL.
  if (!isAuthConfigured()) {
    console.error(
      "[auth] SUPABASE_URL is not set, so no token can be verified and every " +
        "request will be rejected. Set it in apps/api/.env and restart — note " +
        "that dotenv reads the file once at startup, so an already-running " +
        "server won't pick up a change.",
    );
    res.status(503).json({
      error: "AUTH_NOT_CONFIGURED",
      message: "The server can't verify sign-ins. SUPABASE_URL is not set.",
    });
    return;
  }

  const token = bearerToken(req.headers.authorization);
  const user = token ? await verifyAccessToken(token) : null;

  if (!user) {
    res.status(401).json({
      error: "NOT_AUTHENTICATED",
      message: "Sign in to continue.",
    });
    return;
  }

  req.user = user;
  next();
}
