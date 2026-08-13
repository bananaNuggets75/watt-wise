/**
 * Auth client, backed by Supabase Auth.
 *
 * The exported functions are unchanged from the temporary local
 * implementation this replaces, so the register/login pages and the route
 * guard didn't need editing — that was the point of routing every auth call
 * through one module.
 *
 * Supabase stores and refreshes the session itself, so there is no token
 * handling here; ./session reads the current access token out of the client
 * for the API client to send.
 */

import { ApiError } from "./api";
import { isSupabaseConfigured, supabase } from "./supabase";

/** The signed-in user, trimmed to what the UI needs. */
export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

/** Shown when the project hasn't been configured, instead of a network error. */
const NOT_CONFIGURED =
  "Supabase isn't configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to apps/web/.env.";

/** Map a Supabase user onto our shape. */
function toAuthUser(user: { id: string; email?: string; created_at: string }): AuthUser {
  return { id: user.id, email: user.email ?? "", createdAt: user.created_at };
}

/**
 * Create an account.
 *
 * When email confirmation is enabled in the Supabase dashboard, sign-up
 * returns a user but no session — the account isn't usable until the link is
 * clicked. That case is reported as an error so the UI doesn't send someone
 * to a page they can't load yet.
 */
export async function register(email: string, password: string): Promise<AuthUser> {
  if (!isSupabaseConfigured) throw new ApiError(NOT_CONFIGURED, 500);

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new ApiError(error.message, error.status ?? 400);
  if (!data.user) throw new ApiError("Sign-up failed.", 400);

  if (!data.session) {
    throw new ApiError(
      "Check your email to confirm your account, then sign in.",
      400,
    );
  }
  return toAuthUser(data.user);
}

/** Sign in with an existing account. */
export async function login(email: string, password: string): Promise<AuthUser> {
  if (!isSupabaseConfigured) throw new ApiError(NOT_CONFIGURED, 500);

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new ApiError(error.message, error.status ?? 401);
  if (!data.user) throw new ApiError("Incorrect email or password.", 401);

  return toAuthUser(data.user);
}

/** Sign out, clearing the stored session. */
export async function logout(): Promise<void> {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut();
}

/**
 * Resolve the current user, or null when signed out. Supabase refreshes an
 * expired access token as part of this call, so a returning user stays
 * signed in without any token juggling here.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return toAuthUser(data.user);
}
