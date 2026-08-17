/**
 * Supabase access-token verification.
 *
 * The web app signs in directly with Supabase and sends the resulting JWT to
 * this API. We verify it against Supabase's published JSON Web Key Set rather
 * than calling Supabase on every request: the keys are fetched once and
 * cached, so checking a token is local work.
 *
 * Verifying the signature is the whole point — without it, anyone could send
 * a hand-written token claiming to be any user.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";

/** The verified caller. Mirrors what the routes need from a user. */
export interface VerifiedUser {
  id: string;
  email: string;
}

/**
 * Lazily-built key set. Built on first use rather than at import time so the
 * API still starts (and /health still answers) when Supabase isn't
 * configured yet.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/** True when the API has a project to verify tokens against. */
export function isAuthConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL);
}

function getJwks(): ReturnType<typeof createRemoteJWKSet> | null {
  const url = process.env.SUPABASE_URL;
  if (!url) return null;
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
}

/**
 * Verify a Supabase access token and return the user it identifies, or null
 * if it is missing, malformed, expired, or not signed by this project.
 */
export async function verifyAccessToken(token: string): Promise<VerifiedUser | null> {
  const keys = getJwks();
  if (!keys) return null;

  try {
    const { payload } = await jwtVerify(token, keys, {
      // Supabase signs access tokens with this issuer and audience.
      issuer: `${process.env.SUPABASE_URL}/auth/v1`,
      audience: "authenticated",
    });

    // `sub` is the user's uuid — the same value auth.uid() returns in RLS.
    const id = typeof payload.sub === "string" ? payload.sub : null;
    if (!id) return null;

    return { id, email: typeof payload.email === "string" ? payload.email : "" };
  } catch {
    // Any verification failure is simply "not authenticated"; the reason is
    // deliberately not reported to the caller.
    return null;
  }
}
