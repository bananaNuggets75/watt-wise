/**
 * Tests for the unconfigured-deployment path.
 *
 * When SUPABASE_URL is absent the API can verify nobody, so every request is
 * refused. The danger is refusing them as 401 "sign in to continue", which
 * reads as "your login is wrong" and sends whoever is debugging to the wrong
 * place entirely — that actually happened, against a server started before
 * the variable was added.
 *
 * These pin the distinction: a configuration fault reports itself as one.
 */

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../auth/verifyToken.js", () => ({
  isAuthConfigured: () => false,
  // Would accept anything — proving the request never reaches it.
  verifyAccessToken: async () => ({ id: "someone", email: "someone@example.com" }),
}));

const { createApp } = await import("../app.js");
const app = createApp();

describe("when the server has no Supabase project configured", () => {
  it("reports a configuration fault, not a rejected login", async () => {
    const res = await request(app).get("/api/bills");

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("AUTH_NOT_CONFIGURED");
    expect(res.body.message).toMatch(/SUPABASE_URL/);
  });

  it("says the same thing even when a valid-looking token is sent", async () => {
    // The token is irrelevant: nothing can be verified either way, and
    // blaming the caller's credentials would be misleading.
    const res = await request(app)
      .get("/api/bills")
      .set({ Authorization: "Bearer any-token-at-all" });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("AUTH_NOT_CONFIGURED");
  });

  it("applies to the appliance routes too", async () => {
    const res = await request(app).post("/api/appliances").send([{ type: "TV", count: 1 }]);
    expect(res.status).toBe(503);
  });

  it("leaves the health check reachable, so the server still looks alive", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });

  it("leaves the recommendation endpoint working, since it needs no user", async () => {
    const res = await request(app)
      .post("/api/recommendations")
      .send({ accountName: "Cafe Marie", kwhUsed: 312, amount: 1785.5 });

    expect(res.status).toBe(200);
  });
});
