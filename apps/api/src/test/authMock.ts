/**
 * Test helper: a stand-in for Supabase token verification.
 *
 * Integration tests need several distinct users, but real Supabase JWTs
 * would mean a network call and a live project. Instead the verifier is
 * mocked so a token of the form `user:<id>` resolves to that user and
 * anything else is rejected — which keeps the multi-user isolation tests
 * (the ones that actually matter) fast and deterministic.
 *
 * Everything downstream of `req.user` is the real code path.
 */

import { vi } from "vitest";

/** Authorization header for a given test user. */
export function asUser(id: string): { Authorization: string } {
  return { Authorization: `Bearer user:${id}` };
}

/**
 * Install the mock. Call at the top level of a test file, before importing
 * the app, since vi.mock is hoisted.
 */
export function mockTokenVerification(): void {
  vi.mock("../auth/verifyToken.js", () => ({
    verifyAccessToken: async (token: string) => {
      if (!token.startsWith("user:")) return null;
      const id = token.slice("user:".length);
      return id ? { id, email: `${id}@example.com` } : null;
    },
  }));
}
