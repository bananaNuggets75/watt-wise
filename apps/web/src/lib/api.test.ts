/**
 * Tests for the API client.
 *
 * Two things here are easy to break and hard to notice:
 *
 *  - the Authorization header. Every bill and appliance route requires it,
 *    so a call that forgets it fails with a 401 the user reads as "the app
 *    is broken".
 *  - Content-Type on the multipart calls. FormData needs the browser to set
 *    the header so it can include the boundary; setting it by hand produces
 *    a request the server cannot parse, and the failure looks like a
 *    server-side bug.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stand in for the Supabase client, whose session supplies the token.
const getSession = vi.fn();
vi.mock("./supabase", () => ({
  supabase: { auth: { getSession: () => getSession() } },
  isSupabaseConfigured: true,
}));

const { ApiError, createBill, listBills, saveAppliances, scanBill } = await import("./api");

/** A signed-in session. */
function signedIn(token = "access-token-123") {
  getSession.mockResolvedValue({ data: { session: { access_token: token } } });
}

/** No session at all. */
function signedOut() {
  getSession.mockResolvedValue({ data: { session: null } });
}

/** Stub fetch with a canned response, returning the mock for inspection. */
function mockFetch(body: unknown, { ok = true, status = 200 } = {}) {
  const fetchMock = vi.fn(async () => ({ ok, status, json: async () => body }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The headers a fetch call was made with. */
function headersOf(mock: ReturnType<typeof mockFetch>, call = 0): Record<string, string> {
  const init = mock.mock.calls[call]?.[1] as RequestInit | undefined;
  return (init?.headers ?? {}) as Record<string, string>;
}

const billForm = {
  accountName: "Cafe Marie",
  provider: "Meralco",
  kwhUsed: "312",
  amount: "1785.50",
  periodStart: "2026-06-01",
  periodEnd: "2026-06-30",
};

beforeEach(() => signedIn());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("authorisation", () => {
  it("sends the access token when creating a bill", async () => {
    const fetchMock = mockFetch({ id: "1" });
    await createBill(billForm, null);

    expect(headersOf(fetchMock).Authorization).toBe("Bearer access-token-123");
  });

  it("sends the token when listing bills", async () => {
    const fetchMock = mockFetch([]);
    await listBills();

    expect(headersOf(fetchMock).Authorization).toBe("Bearer access-token-123");
  });

  it("sends the token when saving appliances", async () => {
    const fetchMock = mockFetch([]);
    await saveAppliances([{ type: "Air Conditioner", count: 1 }]);

    expect(headersOf(fetchMock).Authorization).toBe("Bearer access-token-123");
  });

  it("sends the token when scanning", async () => {
    const fetchMock = mockFetch({ rawText: "" });
    await scanBill(new File(["x"], "bill.png", { type: "image/png" }));

    expect(headersOf(fetchMock).Authorization).toBe("Bearer access-token-123");
  });

  it("omits the header entirely when signed out", async () => {
    // An absent header is right; "Bearer null" would be a confusing 401.
    signedOut();
    const fetchMock = mockFetch([]);
    await listBills();

    expect(headersOf(fetchMock).Authorization).toBeUndefined();
  });

  it("uses the current token, not one captured earlier", async () => {
    // Supabase rotates the access token on refresh, so it must be read per
    // request rather than cached at module load.
    const fetchMock = mockFetch([]);
    await listBills();
    signedIn("rotated-token");
    await listBills();

    expect(headersOf(fetchMock, 1).Authorization).toBe("Bearer rotated-token");
  });
});

describe("multipart requests", () => {
  it("does not set Content-Type when creating a bill", async () => {
    // The browser must set it, so the multipart boundary is included.
    const fetchMock = mockFetch({ id: "1" });
    await createBill(billForm, null);

    expect(headersOf(fetchMock)["Content-Type"]).toBeUndefined();
  });

  it("does not set Content-Type when scanning", async () => {
    const fetchMock = mockFetch({ rawText: "" });
    await scanBill(new File(["x"], "bill.png", { type: "image/png" }));

    expect(headersOf(fetchMock)["Content-Type"]).toBeUndefined();
  });

  it("sends the manual fields as form data", async () => {
    const fetchMock = mockFetch({ id: "1" });
    await createBill(billForm, null);

    const body = (fetchMock.mock.calls[0]?.[1] as RequestInit).body as FormData;
    expect(body.get("accountName")).toBe("Cafe Marie");
    expect(body.get("kwhUsed")).toBe("312");
  });

  it("attaches the file only when one was chosen", async () => {
    const fetchMock = mockFetch({ id: "1" });
    await createBill(billForm, null);

    const body = (fetchMock.mock.calls[0]?.[1] as RequestInit).body as FormData;
    expect(body.get("file")).toBeNull();
  });
});

describe("JSON requests", () => {
  it("sets Content-Type for the appliance survey", async () => {
    const fetchMock = mockFetch([]);
    await saveAppliances([{ type: "Television", count: 1 }]);

    expect(headersOf(fetchMock)["Content-Type"]).toBe("application/json");
  });

  it("keeps the auth header alongside Content-Type", async () => {
    // Spreading one object into another is easy to get wrong.
    const fetchMock = mockFetch([]);
    await saveAppliances([{ type: "Television", count: 1 }]);

    expect(headersOf(fetchMock).Authorization).toBe("Bearer access-token-123");
  });
});

describe("error handling", () => {
  it("throws an ApiError carrying the status", async () => {
    mockFetch({ error: "VALIDATION_FAILED" }, { ok: false, status: 400 });

    await expect(createBill(billForm, null)).rejects.toBeInstanceOf(ApiError);
  });

  it("surfaces the per-field details so the form can show them", async () => {
    mockFetch(
      { error: "VALIDATION_FAILED", details: ["kwhUsed must be a non-negative number"] },
      { ok: false, status: 400 },
    );

    await expect(createBill(billForm, null)).rejects.toMatchObject({
      status: 400,
      details: ["kwhUsed must be a non-negative number"],
    });
  });

  it("prefers the server's message over the error code", async () => {
    mockFetch({ error: "FILE_TOO_LARGE", message: "Max file size is 10 MB." }, { ok: false, status: 400 });

    await expect(createBill(billForm, null)).rejects.toThrow("Max file size is 10 MB.");
  });

  it("falls back to a readable message when the body isn't JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => { throw new Error("not json"); },
    })));

    await expect(createBill(billForm, null)).rejects.toThrow("Failed to save bill");
  });

  it("reports a failed scan rather than returning empty suggestions", async () => {
    // Silently returning nothing would look like "the bill was unreadable",
    // hiding an outage from whoever is debugging it.
    mockFetch({ error: "SCAN_UNAVAILABLE", message: "Bill scanning isn't configured." }, { ok: false, status: 503 });

    await expect(
      scanBill(new File(["x"], "bill.png", { type: "image/png" })),
    ).rejects.toThrow("Bill scanning isn't configured.");
  });
});
