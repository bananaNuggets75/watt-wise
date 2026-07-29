/**
 * Authentication middleware.
 *
 * Rejects requests without a valid bearer token, and attaches the resolved
 * user to the request so handlers can scope data to its owner. Applying this
 * is what stops one user's bills being readable by anyone who asks.
 *
 * When auth moves to Supabase, only `getUserByToken` changes — verifying a
 * Supabase JWT instead of looking up a local session. Handlers keep reading
 * `req.user`.
 */

import type { NextFunction, Request, Response } from "express";
import { getUserByToken } from "../store/userStore.js";
import type { PublicUser } from "../types/user.js";

// Make `req.user` known to TypeScript across the app.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: PublicUser;
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
 * is missing, malformed, or no longer valid (e.g. after logout or a restart).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = bearerToken(req.headers.authorization);
  const user = token ? getUserByToken(token) : undefined;

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
