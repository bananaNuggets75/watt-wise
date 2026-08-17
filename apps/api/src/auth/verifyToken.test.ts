/**
 * Tests for Supabase access-token verification.
 *
 * This is the security boundary of the whole API: if a forged token were
 * ever accepted, every per-user protection above it would be decorative. The
 * tests therefore focus on rejection — unsigned tokens, tokens signed by the
 * wrong key, and expired ones.
 *
 * A throwaway key pair stands in for Supabase's, served through a stubbed
 * fetch, so no live project is needed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

const SUPABASE_URL = "https://test-project.supabase.co";

/** Build a signing key pair and the JWKS document that publishes it. */
async function makeKeys() {
  const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  jwk.alg = "RS256";
  jwk.use = "sig";
  return { privateKey, jwks: { keys: [jwk] } };
}

/** Serve a JWKS document from the stubbed fetch. */
function serveJwks(jwks: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => jwks,
    })),
  );
}

/** Mint a token as Supabase would. */
async function mintToken(
  privateKey: CryptoKey,
  claims: Record<string, unknown> = {},
  { expired = false } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: "kenan@example.com", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setSubject((claims.sub as string) ?? "user-uuid-1")
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setAudience("authenticated")
    .setIssuedAt(expired ? now - 7200 : now)
    .setExpirationTime(expired ? now - 3600 : now + 3600)
    .sign(privateKey);
}

beforeEach(() => {
  process.env.SUPABASE_URL = SUPABASE_URL;
  // The key set is cached per module, so reset between tests.
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a valid token", () => {
  it("resolves to the user it identifies", async () => {
    const { privateKey, jwks } = await makeKeys();
    serveJwks(jwks);
    const { verifyAccessToken } = await import("./verifyToken.js");

    const token = await mintToken(privateKey, { sub: "abc-123" });
    const user = await verifyAccessToken(token);

    expect(user).toEqual({ id: "abc-123", email: "kenan@example.com" });
  });

  it("tolerates a token with no email claim", async () => {
    const { privateKey, jwks } = await makeKeys();
    serveJwks(jwks);
    const { verifyAccessToken } = await import("./verifyToken.js");

    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setSubject("no-email")
      .setIssuer(`${SUPABASE_URL}/auth/v1`)
      .setAudience("authenticated")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);

    expect(await verifyAccessToken(token)).toEqual({ id: "no-email", email: "" });
  });
});

describe("tokens that must be rejected", () => {
  it("rejects a token signed by a different key", async () => {
    // The attack this whole mechanism exists to stop: a self-signed token
    // claiming to be someone else.
    const { jwks } = await makeKeys();
    const { privateKey: attackerKey } = await makeKeys();
    serveJwks(jwks);
    const { verifyAccessToken } = await import("./verifyToken.js");

    const forged = await mintToken(attackerKey, { sub: "victim" });
    expect(await verifyAccessToken(forged)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { privateKey, jwks } = await makeKeys();
    serveJwks(jwks);
    const { verifyAccessToken } = await import("./verifyToken.js");

    const token = await mintToken(privateKey, {}, { expired: true });
    expect(await verifyAccessToken(token)).toBeNull();
  });

  it("rejects a token issued by another Supabase project", async () => {
    const { privateKey, jwks } = await makeKeys();
    serveJwks(jwks);
    const { verifyAccessToken } = await import("./verifyToken.js");

    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setSubject("someone")
      .setIssuer("https://other-project.supabase.co/auth/v1")
      .setAudience("authenticated")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);

    expect(await verifyAccessToken(token)).toBeNull();
  });

  it("rejects a token for the wrong audience", async () => {
    const { privateKey, jwks } = await makeKeys();
    serveJwks(jwks);
    const { verifyAccessToken } = await import("./verifyToken.js");

    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setSubject("someone")
      .setIssuer(`${SUPABASE_URL}/auth/v1`)
      .setAudience("anon")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);

    expect(await verifyAccessToken(token)).toBeNull();
  });

  it("rejects a token with no subject", async () => {
    const { privateKey, jwks } = await makeKeys();
    serveJwks(jwks);
    const { verifyAccessToken } = await import("./verifyToken.js");

    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(`${SUPABASE_URL}/auth/v1`)
      .setAudience("authenticated")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);

    expect(await verifyAccessToken(token)).toBeNull();
  });

  it("rejects a garbage string", async () => {
    const { jwks } = await makeKeys();
    serveJwks(jwks);
    const { verifyAccessToken } = await import("./verifyToken.js");

    expect(await verifyAccessToken("not-a-token")).toBeNull();
  });
});

describe("when Supabase is unreachable or unconfigured", () => {
  it("rejects rather than admitting anyone when no project is configured", async () => {
    delete process.env.SUPABASE_URL;
    const { verifyAccessToken } = await import("./verifyToken.js");

    // Failing closed matters: an unconfigured deployment must not become an
    // open one.
    expect(await verifyAccessToken("any-token")).toBeNull();
  });

  it("rejects when the key set cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ENOTFOUND"); }));
    const { verifyAccessToken } = await import("./verifyToken.js");

    expect(await verifyAccessToken("some-token")).toBeNull();
  });
});
