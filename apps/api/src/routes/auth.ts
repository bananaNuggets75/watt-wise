/**
 * Authentication routes.
 *
 *   POST /api/auth/register  Create an account and sign in.
 *   POST /api/auth/login     Sign in with existing credentials.
 *   POST /api/auth/logout    Invalidate the current token.
 *   GET  /api/auth/me        Return the signed-in user for a bearer token.
 *
 * Backed by the local user store for now; see apps/api/src/store/userStore.ts
 * for the Supabase migration note.
 */

import { Router } from "express";
import {
  endSession,
  getUserByToken,
  loginUser,
  registerUser,
} from "../store/userStore.js";
import type { Credentials } from "../types/user.js";

export const authRouter = Router();

/** Minimum password length. Kept modest — this is a project MVP, not a bank. */
const MIN_PASSWORD_LENGTH = 8;

/** Basic shape check; real deliverability is verified by sending mail, which
 *  we don't do yet. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate the credentials body. Returns the values or a list of messages
 * the form can show under the matching field.
 */
function parseCredentials(body: Record<string, unknown>): {
  credentials?: Credentials;
  errors: string[];
} {
  const errors: string[] = [];
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  if (!email) errors.push("Email is required.");
  else if (!EMAIL_PATTERN.test(email)) errors.push("Enter a valid email address.");

  if (!password) errors.push("Password is required.");
  else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  if (errors.length > 0) return { errors };
  return { credentials: { email, password }, errors: [] };
}

/** Pull the bearer token out of the Authorization header, if present. */
function bearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length).trim() || undefined;
}

/** POST /api/auth/register — create an account, then sign in. */
authRouter.post("/register", (req, res) => {
  const { credentials, errors } = parseCredentials(req.body ?? {});
  if (!credentials) {
    return res.status(400).json({ error: "VALIDATION_FAILED", details: errors });
  }

  const session = registerUser(credentials.email, credentials.password);
  if (!session) {
    return res
      .status(409)
      .json({ error: "EMAIL_TAKEN", message: "That email is already registered." });
  }
  return res.status(201).json(session);
});

/** POST /api/auth/login — sign in with existing credentials. */
authRouter.post("/login", (req, res) => {
  const { credentials, errors } = parseCredentials(req.body ?? {});
  if (!credentials) {
    return res.status(400).json({ error: "VALIDATION_FAILED", details: errors });
  }

  const session = loginUser(credentials.email, credentials.password);
  if (!session) {
    // Deliberately vague: saying which half was wrong would reveal whether
    // an email is registered.
    return res
      .status(401)
      .json({ error: "INVALID_CREDENTIALS", message: "Incorrect email or password." });
  }
  return res.json(session);
});

/** POST /api/auth/logout — drop the session behind the bearer token. */
authRouter.post("/logout", (req, res) => {
  const token = bearerToken(req.headers.authorization);
  if (token) endSession(token);
  // Always 204: logging out an already-invalid token isn't an error.
  return res.status(204).end();
});

/** GET /api/auth/me — who is this token? Used to restore a session on load. */
authRouter.get("/me", (req, res) => {
  const token = bearerToken(req.headers.authorization);
  const user = token ? getUserByToken(token) : undefined;
  if (!user) return res.status(401).json({ error: "NOT_AUTHENTICATED" });
  return res.json(user);
});
