/**
 * Supabase access for the API, acting as the calling user.
 *
 * The client is built per request with the caller's own access token, not
 * with the service role key. That matters: the service role bypasses
 * Row-Level Security, which would make correct `where account_id = ...`
 * clauses in this codebase the *only* thing standing between one user and
 * another's data. Passing the user's token through means Postgres enforces
 * the policies in supabase/migrations/20260814000400_row_level_security.sql
 * as well, so a missed filter here is a failed query rather than a leak.
 *
 * A fresh client per request is cheap — supabase-js is a thin wrapper over
 * fetch, and no connection pool is involved.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Thrown when the project isn't configured, so routes can answer 503. */
export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super("SUPABASE_URL / SUPABASE_ANON_KEY are not set.");
    this.name = "SupabaseNotConfiguredError";
  }
}

/**
 * A database failure, carried up so a route can decide what it means.
 *
 * It lives here rather than in one store because every store raises it and
 * routes branch on it — a per-store copy would mean `instanceof` quietly
 * failing whenever a route handled an error from a store it didn't import.
 */
export class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseError";
  }
}

/** True when the API has the settings needed to reach the database. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

/**
 * A client scoped to one signed-in user. Every query it makes runs as that
 * user, so auth.uid() in an RLS policy resolves to them.
 *
 * Read from process.env on each call rather than at import time: dotenv
 * loads in index.ts, and reading at import would capture the values before
 * that runs in some entry points.
 */
export function userClient(accessToken: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new SupabaseNotConfiguredError();

  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    // The API is stateless: it holds no session and refreshes no token. The
    // caller's token is passed straight through and expires on its own.
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
