/**
 * Auth client and session handling for the web app.
 *
 * Wraps the /api/auth endpoints and keeps the session token in
 * localStorage so a refresh doesn't sign the user out. Components call
 * these functions rather than fetching auth endpoints directly, which is
 * also what makes the eventual switch to Supabase Auth a change to this
 * file alone.
 *
 * The token itself lives in ./session, which the API client also reads so
 * it can authorise every request.
 */

import { ApiError } from "./api";
import { clearToken, getToken, setToken } from "./session";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
/** The signed-in user as the API returns it. */
export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

interface AuthSession {
  user: AuthUser;
  token: string;
}

/**
 * POST credentials to an auth endpoint and store the returned token.
 * Shared by register and login, which differ only in the path.
 */
async function submitCredentials(
  path: "register" | "login",
  email: string,
  password: string,
): Promise<AuthUser> {
  const res = await fetch(`${API_URL}/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      data.message ?? data.error ?? "Authentication failed",
      res.status,
      data.details,
    );
  }

  const session = data as AuthSession;
  setToken(session.token);
  return session.user;
}

/** Create an account and sign in. */
export function register(email: string, password: string): Promise<AuthUser> {
  return submitCredentials("register", email, password);
}

/** Sign in with an existing account. */
export function login(email: string, password: string): Promise<AuthUser> {
  return submitCredentials("login", email, password);
}

/**
 * Sign out. The token is cleared locally even if the server call fails,
 * so the user is never left appearing signed in.
 */
export async function logout(): Promise<void> {
  const token = getToken();
  clearToken();
  if (!token) return;
  await fetch(`${API_URL}/api/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined);
}

/**
 * Restore the session on page load. Returns null when there's no token or
 * the stored one is no longer valid (e.g. the API restarted), clearing the
 * stale token in that case.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = getToken();
  if (!token) return null;

  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);

  if (!res?.ok) {
    clearToken();
    return null;
  }
  return (await res.json()) as AuthUser;
}
