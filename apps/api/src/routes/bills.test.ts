/**
 * Integration tests for the bill routes.
 *
 * The store is mocked, so these cover what the route layer owns: auth, the
 * ownership gate, validation, and the mapping from a database failure to a
 * status the client can act on.
 *
 * The behaviour worth guarding above all is that the establishment comes
 * from the path and is checked before anything is written — that is what
 * stops a caller filing a bill under someone else's establishment.
 */

import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/verifyToken.js", () => ({
  isAuthConfigured: () => true,
  verifyAccessToken: async (token: string) => {
    if (!token.startsWith("user:")) return null;
    const id = token.slice("user:".length);
    return id ? { id, email: `${id}@example.com` } : null;
  },
}));

const getEstablishment = vi.fn();
// The whole module has to be stood in for, since the establishment router
// imports the rest of it at load time.
vi.mock("../store/establishmentStore.js", () => ({
  getEstablishment,
  listEstablishmentTypes: vi.fn(),
  listProviders: vi.fn(),
  createEstablishment: vi.fn(),
  listEstablishments: vi.fn(),
}));

const createBill = vi.fn();
const listBills = vi.fn();
const getBill = vi.fn();
vi.mock("../store/billStore.js", () => ({ createBill, listBills, getBill }));

const { DatabaseError } = await import("../store/supabaseClient.js");
const { createApp } = await import("../app.js");
const app = createApp();

const asUser = (id: string) => ({ Authorization: `Bearer user:${id}` });

const EST_ID = "33333333-3333-3333-3333-333333333333";
const PROVIDER_ID = "22222222-2222-2222-2222-222222222222";
const OTHER_PROVIDER_ID = "44444444-4444-4444-4444-444444444444";
const BILL_ID = "55555555-5555-5555-5555-555555555555";

const establishment = {
  id: EST_ID,
  accountId: "u1",
  name: "Brew Corner Cafe",
  typeId: "11111111-1111-1111-1111-111111111111",
  providerId: PROVIDER_ID,
  createdAt: "2026-06-01T00:00:00.000Z",
};

const billsUrl = `/api/establishments/${EST_ID}/bills`;

/** The form fields a valid submission carries. */
const validFields = {
  kwhUsed: "312",
  amount: "1785.50",
  periodStart: "2026-06-01",
  periodEnd: "2026-06-30",
};

/** POST the bill form as multipart, the way the browser sends it. */
function postBill(userId: string, fields: Record<string, string> = validFields) {
  const req = request(app).post(billsUrl).set(asUser(userId));
  for (const [key, value] of Object.entries(fields)) req.field(key, value);
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  getEstablishment.mockResolvedValue(establishment);
  createBill.mockImplementation(async (_token, establishmentId, input) => ({
    id: BILL_ID,
    establishmentId,
    ...input,
  }));
  listBills.mockResolvedValue([]);
  getBill.mockResolvedValue(null);
});

describe("authentication and configuration", () => {
  it("rejects an unauthenticated request", async () => {
    expect((await request(app).get(billsUrl)).status).toBe(401);
  });

  it("reports a missing database configuration as 503, not a bad request", async () => {
    delete process.env.SUPABASE_ANON_KEY;

    const res = await request(app).get(billsUrl).set(asUser("u1"));

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("DATABASE_NOT_CONFIGURED");
  });
});

describe("the establishment gate", () => {
  it("404s for an establishment that isn't the caller's", async () => {
    getEstablishment.mockResolvedValue(null);

    const res = await postBill("u1");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("ESTABLISHMENT_NOT_FOUND");
  });

  it("writes nothing when the establishment check fails", async () => {
    // The point of checking first: a foreign establishment must not reach
    // the insert and fail there as a foreign-key error.
    getEstablishment.mockResolvedValue(null);

    await postBill("u1");

    expect(createBill).not.toHaveBeenCalled();
  });
});

describe("recording a bill", () => {
  it("stores it against the establishment named in the path", async () => {
    const res = await postBill("u1");

    expect(res.status).toBe(201);
    expect(createBill).toHaveBeenCalledWith(
      "user:u1",
      EST_ID,
      expect.objectContaining({ kwhUsed: 312, amount: 1785.5 }),
      null,
    );
  });

  it("coerces the numbers out of the multipart strings", async () => {
    await postBill("u1");

    const input = createBill.mock.calls[0][2];
    expect(typeof input.kwhUsed).toBe("number");
    expect(typeof input.amount).toBe("number");
  });

  it("defaults the provider to the establishment's own utility", async () => {
    // One establishment is one utility account, so the statement is nearly
    // always from the provider already on file.
    await postBill("u1");

    expect(createBill.mock.calls[0][2].providerId).toBe(PROVIDER_ID);
  });

  it("keeps a provider the caller sent explicitly", async () => {
    await postBill("u1", { ...validFields, providerId: OTHER_PROVIDER_ID });

    expect(createBill.mock.calls[0][2].providerId).toBe(OTHER_PROVIDER_ID);
  });

  it("keeps the customer account number as plain metadata", async () => {
    await postBill("u1", { ...validFields, customerAccountNumber: "1234567890" });

    expect(createBill.mock.calls[0][2].customerAccountNumber).toBe("1234567890");
  });
});

describe("validation", () => {
  it("requires the period dates", async () => {
    const res = await postBill("u1", { kwhUsed: "312", amount: "1785.50" });

    expect(res.status).toBe(400);
    expect(res.body.details).toContain("periodStart is required");
    expect(res.body.details).toContain("periodEnd is required");
  });

  it("rejects negative usage", async () => {
    const res = await postBill("u1", { ...validFields, kwhUsed: "-5" });

    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatch(/kwhUsed/);
  });

  it("rejects a non-numeric amount", async () => {
    const res = await postBill("u1", { ...validFields, amount: "a lot" });

    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatch(/amount/);
  });

  it("rejects a period that ends before it starts", async () => {
    // The bills_period_order constraint would catch this too, but as a check
    // violation it would surface as a server fault rather than bad input.
    const res = await postBill("u1", {
      ...validFields,
      periodStart: "2026-06-30",
      periodEnd: "2026-06-01",
    });

    expect(res.status).toBe(400);
    expect(res.body.details).toContain("periodEnd must not be before periodStart");
  });

  it("rejects a provider name where an id belongs", async () => {
    const res = await postBill("u1", { ...validFields, providerId: "Meralco" });

    expect(res.status).toBe(400);
    expect(res.body.details).toContain("provider is not a valid selection");
  });

  it("saves nothing when validation fails", async () => {
    await postBill("u1", { kwhUsed: "312" });

    expect(createBill).not.toHaveBeenCalled();
  });
});

describe("file attachments", () => {
  it("records the file's metadata but not its bytes", async () => {
    const res = await request(app)
      .post(billsUrl)
      .set(asUser("u1"))
      .field(validFields)
      .attach("file", Buffer.from("fake image bytes"), {
        filename: "june-2026.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(201);
    expect(createBill.mock.calls[0][3]).toEqual({
      originalName: "june-2026.png",
      mimeType: "image/png",
      size: 16,
    });
  });

  it("rejects a file type that is neither an image nor a PDF", async () => {
    const res = await request(app)
      .post(billsUrl)
      .set(asUser("u1"))
      .field(validFields)
      .attach("file", Buffer.from("#!/bin/sh"), {
        filename: "payload.sh",
        contentType: "application/x-sh",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("UNSUPPORTED_FILE_TYPE");
  });
});

describe("reading bills", () => {
  it("lists only the establishment's own", async () => {
    listBills.mockResolvedValue([{ id: BILL_ID, establishmentId: EST_ID }]);

    const res = await request(app).get(billsUrl).set(asUser("u1"));

    expect(res.status).toBe(200);
    expect(listBills).toHaveBeenCalledWith("user:u1", EST_ID);
  });

  it("fetches one by id", async () => {
    getBill.mockResolvedValue({ id: BILL_ID, establishmentId: EST_ID });

    const res = await request(app).get(`${billsUrl}/${BILL_ID}`).set(asUser("u1"));

    expect(res.status).toBe(200);
    expect(getBill).toHaveBeenCalledWith("user:u1", EST_ID, BILL_ID);
  });

  it("404s for a bill the caller can't see", async () => {
    getBill.mockResolvedValue(null);

    const res = await request(app).get(`${billsUrl}/${BILL_ID}`).set(asUser("u1"));

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("BILL_NOT_FOUND");
  });

  it("404s for a malformed id without querying", async () => {
    // Postgres would raise on a uuid comparison, which would read as a
    // server fault rather than a bad path.
    const res = await request(app).get(`${billsUrl}/not-a-uuid`).set(asUser("u1"));

    expect(res.status).toBe(404);
    expect(getBill).not.toHaveBeenCalled();
  });
});

describe("database failures", () => {
  it("reports a stale provider selection as a 400", async () => {
    createBill.mockRejectedValue(
      new DatabaseError('insert violates foreign key constraint "bills_provider_id_fkey"'),
    );

    const res = await postBill("u1");

    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatch(/no longer exists/);
  });

  it("reports an RLS refusal as a 403", async () => {
    createBill.mockRejectedValue(
      new DatabaseError('new row violates row-level security policy for table "bills"'),
    );

    expect((await postBill("u1")).status).toBe(403);
  });

  it("reports an unreachable database as a 502", async () => {
    listBills.mockRejectedValue(new DatabaseError("fetch failed"));

    expect((await request(app).get(billsUrl).set(asUser("u1"))).status).toBe(502);
  });
});
