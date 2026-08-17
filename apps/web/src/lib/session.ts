/**
 * Access to the current session token, for authorising API calls.
 *
 * Supabase owns the session — it persists it and refreshes an expired access
 * token — so this reads from the client rather than storing anything itself.
 * These are async because refreshing may require a round trip.
 *
 * Kept separate from ./auth because the API client also needs it, and
 * importing it from there would create a cycle between the two modules.
 */

import { supabase } from "./supabase";

/** The current access token, or null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Authorization header for API calls, or an empty object when signed out —
 * spread into a fetch's headers so callers don't branch on it.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
