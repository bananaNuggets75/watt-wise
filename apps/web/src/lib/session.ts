/**
 * Session token storage.
 *
 * Kept in its own module because both the auth client (which obtains the
 * token) and the API client (which sends it on every request) need it —
 * importing it from either one would create a cycle between them.
 *
 * Note: localStorage is readable by any script on the page, so this is
 * vulnerable to XSS. It's the same default Supabase's client uses, and an
 * accepted trade-off for this MVP; hardening would move to an httpOnly
 * cookie set by the server.
 */

const TOKEN_KEY = "wattwise.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Authorization header for API calls, or an empty object when signed out —
 * spread into a fetch's headers so callers don't branch on it.
 */
export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
