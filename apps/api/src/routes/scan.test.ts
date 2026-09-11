/**
 * Network-level tests for the bill scan endpoint.
 *
 * The OpenRouter call is intercepted rather than made for real: tests must
 * not depend on a third party's uptime (the free vision endpoint sits around
 * 60%), must not spend quota, and must not send anything anywhere. Faking
 * the response is also the only way to exercise the failure paths — a 429, a
 * timeout, a reply that isn't JSON — which is exactly where the endpoint
 * either degrades gracefully or doesn't.
 */

import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/verifyToken.js", () => ({
  // The middleware checks this first; without it the mock is incomplete and
  // requests hang rather than failing visibly.
  isAuthConfigured: () => true,
  verifyAccessToken: async (token: string) => {
    if (!token.startsWith("user:")) return null;
    const id = token.slice("user:".length);
    return id ? { id, email: `${id}@example.com` } : null;
  },
}));

const { createApp } = await import("../app.js");
const app = createApp();

const asUser = (id: string) => ({ Authorization: `Bearer user:${id}` });
const png = Buffer.from("89504e470d0a1a0a", "hex");

/** Post an image to the scan endpoint. */
function postScan(userId = "scanner", buffer = png, contentType = "image/png") {
  return request(app)
    .post("/api/bills/scan")
    .set(asUser(userId))
    .attach("file", buffer, { filename: "bill.png", contentType });
}

/** Stub global fetch with a canned OpenRouter response. */
function mockOpenRouter(reply: { ok: boolean; status?: number; content?: string; body?: unknown }) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
    ok: reply.ok,
    status: reply.status ?? (reply.ok ? 200 : 500),
    json: async () =>
      reply.body ?? { choices: [{ message: { content: reply.content ?? "" } }] },
    text: async () => "error detail",
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  // The route refuses to scan without a key, so give it one.
  process.env.OPENROUTER_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("request handling", () => {
  it("rejects an unauthenticated scan", async () => {
    const res = await request(app)
      .post("/api/bills/scan")
      .attach("file", png, { filename: "bill.png", contentType: "image/png" });
    expect(res.status).toBe(401);
  });

  it("400s when no image is attached", async () => {
    const res = await request(app).post("/api/bills/scan").set(asUser("no-image"));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("NO_IMAGE");
  });

  it("rejects a PDF, since the vision model is sent a raster image", async () => {
    const res = await postScan("pdf", Buffer.from("%PDF-1.4"), "application/pdf");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("says scanning is unavailable rather than failing obscurely", async () => {
    // Without a key there is no reader at all. Manual entry still works, so
    // this must be a clear signal rather than a 500.
    delete process.env.OPENROUTER_API_KEY;
    const res = await postScan("unconfigured");

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("SCAN_UNAVAILABLE");
  });
});

describe("a successful scan", () => {
  it("returns the fields the model read", async () => {
    mockOpenRouter({
      ok: true,
      content: JSON.stringify({
        accountName: "Dela Cruz, Juan",
        provider: "Meralco",
        kwhUsed: 136,
        amount: 1490.07,
        periodStart: "2022-12-23",
        periodEnd: "2023-01-22",
      }),
    });

    const res = await postScan();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      engine: "openrouter-vision",
      accountName: "Dela Cruz, Juan",
      kwhUsed: 136,
      amount: 1490.07,
    });
  });

  it("sends the image to OpenRouter as a data URL with the key attached", async () => {
    const fetchMock = mockOpenRouter({ ok: true, content: "{}" });
    await postScan();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("openrouter.ai");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(init.body as string).toContain("data:image/png;base64,");
  });

  it("offers OpenRouter a list of models, not just one", async () => {
    // A single model is a single point of failure: the previous default was
    // delisted and every scan broke. The list lets OpenRouter fall through.
    const fetchMock = mockOpenRouter({ ok: true, content: "{}" });
    await postScan();

    const body = JSON.parse((fetchMock.mock.calls[0][1].body as string) as string);
    expect(Array.isArray(body.models)).toBe(true);
    expect(body.models.length).toBeGreaterThan(1);
    expect(body.model).toBeUndefined();
  });

  it("puts a configured OCR_MODEL first, keeping the defaults as backups", async () => {
    process.env.OCR_MODEL = "some/other-model:free";
    const fetchMock = mockOpenRouter({ ok: true, content: "{}" });
    await postScan();

    const body = JSON.parse((fetchMock.mock.calls[0][1].body as string) as string);
    expect(body.models[0]).toBe("some/other-model:free");
    expect(body.models.length).toBeGreaterThan(1);
    delete process.env.OCR_MODEL;
  });

  it("still succeeds when the model could read nothing", async () => {
    // A blank result is a valid answer: the user types the numbers instead.
    mockOpenRouter({ ok: true, content: "I cannot read this image." });
    const res = await postScan();

    expect(res.status).toBe(200);
    expect(res.body.kwhUsed).toBeUndefined();
  });

  it("returns only the fields that were legible", async () => {
    mockOpenRouter({
      ok: true,
      content: '{"kwhUsed": 246, "amount": 3229.21, "provider": null}',
    });
    const res = await postScan();

    expect(res.body.kwhUsed).toBe(246);
    expect(res.body.provider).toBeUndefined();
  });
});

describe("when OpenRouter fails", () => {
  it("reports a rate limit as a scan failure, not a crash", async () => {
    mockOpenRouter({ ok: false, status: 429 });
    const res = await postScan();

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("SCAN_FAILED");
  });

  it("handles an authentication failure", async () => {
    mockOpenRouter({ ok: false, status: 401 });
    expect((await postScan()).status).toBe(502);
  });

  it("handles the network being unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const res = await postScan();

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("SCAN_FAILED");
  });

  it("handles a malformed response body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new Error("not json"); },
      text: async () => "",
    })));

    expect((await postScan()).status).toBe(502);
  });

  it("treats an error returned with HTTP 200 as a failure", async () => {
    // OpenRouter reports some faults this way; reading it as an empty result
    // would tell the user their bill was unreadable during an outage.
    mockOpenRouter({ ok: true, body: { error: { code: 404, message: "No endpoints found" } } });
    const res = await postScan();

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("SCAN_FAILED");
  });

  it("does not leak the upstream error to the caller", async () => {
    mockOpenRouter({ ok: false, status: 500 });
    const res = await postScan();

    // The provider's message could contain internals or key fragments.
    expect(JSON.stringify(res.body)).not.toContain("test-key");
    expect(res.body.message).toBe("Could not read the image.");
  });
});
