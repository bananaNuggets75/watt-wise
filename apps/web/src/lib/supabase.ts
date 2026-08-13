/**
 * Supabase browser client.
 *
 * Uses the anon (publishable) key, which is designed to be public — the
 * database's Row-Level Security policies are what actually restrict access,
 * not the secrecy of this key. The service role key must never appear here:
 * Vite inlines every VITE_ variable into the shipped bundle, and that key
 * bypasses RLS entirely.
 *
 * The client persists its session and refreshes the access token on its own,
 * so nothing else needs to manage token lifetimes.
 */

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * True when the project has been configured. Checked rather than assumed so
 * a missing .env produces a clear message in the UI instead of an opaque
 * network failure.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  console.warn(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — " +
      "copy apps/web/.env.example to apps/web/.env and fill them in.",
  );
}

// Fall back to harmless placeholders when unconfigured: createClient throws
// on an empty URL, which would take down the whole app before the UI could
// explain what's missing.
export const supabase = createClient(
  url ?? "http://localhost:54321",
  anonKey ?? "public-anon-key",
);
