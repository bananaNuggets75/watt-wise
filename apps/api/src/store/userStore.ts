/**
 * In-memory user store with password hashing.
 *
 * Passwords are hashed with scrypt (Node's built-in — no extra dependency)
 * and a per-user random salt, so plaintext passwords are never stored even
 * in this temporary implementation. Sessions are opaque random tokens held
 * in a map.
 *
 * LIMITS — this is a development stand-in for Supabase Auth:
 *   - users and sessions live in process memory, so both reset on restart
 *   - there is no email verification, password reset, or rate limiting
 * When the Supabase project exists, this file is what gets replaced; the
 * routes and the web client keep the same shapes.
 */

import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { AuthSession, PublicUser, StoredUser } from "../types/user.js";

const users: StoredUser[] = [];

/** token -> userId. An opaque token avoids signing/verifying keys for now. */
const sessions = new Map<string, string>();

/** Hash a password with scrypt using the given salt. */
function hash(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

/** Strip the secret fields before anything leaves the server. */
function toPublic(user: StoredUser): PublicUser {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

/** Issue a session token for a user. */
function createSession(user: StoredUser): AuthSession {
  const token = randomBytes(32).toString("hex");
  sessions.set(token, user.id);
  return { user: toPublic(user), token };
}

/** Emails are matched case-insensitively, as users expect. */
function findByEmail(email: string): StoredUser | undefined {
  const normalised = email.trim().toLowerCase();
  return users.find((u) => u.email === normalised);
}

/**
 * Register a new user and sign them straight in. Returns null if the email
 * is already taken — the route turns that into a 409.
 */
export function registerUser(email: string, password: string): AuthSession | null {
  if (findByEmail(email)) return null;

  const salt = randomBytes(16).toString("hex");
  const user: StoredUser = {
    id: randomUUID(),
    email: email.trim().toLowerCase(),
    createdAt: new Date().toISOString(),
    salt,
    passwordHash: hash(password, salt),
  };
  users.push(user);
  return createSession(user);
}

/**
 * Verify credentials and start a session. Returns null when the email is
 * unknown OR the password is wrong — the route must not distinguish the two,
 * or it would leak which emails are registered.
 */
export function loginUser(email: string, password: string): AuthSession | null {
  const user = findByEmail(email);
  if (!user) return null;

  // Constant-time comparison so response timing doesn't leak the hash.
  const attempt = Buffer.from(hash(password, user.salt), "hex");
  const stored = Buffer.from(user.passwordHash, "hex");
  if (attempt.length !== stored.length || !timingSafeEqual(attempt, stored)) {
    return null;
  }
  return createSession(user);
}

/** Resolve a bearer token to its user, or undefined if it isn't valid. */
export function getUserByToken(token: string): PublicUser | undefined {
  const userId = sessions.get(token);
  if (!userId) return undefined;
  const user = users.find((u) => u.id === userId);
  return user ? toPublic(user) : undefined;
}

/** Invalidate a token (logout). */
export function endSession(token: string): void {
  sessions.delete(token);
}
