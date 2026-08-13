/**
 * Integration tests for the bill routes.
 *
 * These drive the real Express app through supertest — routers, multer,
 * validation, the store and the error handler all run. Only token
 * verification is mocked, so several users can be simulated without a live
 * Supabase project.
 *
 * The isolation tests are the important ones: they're what stops one user's
 * bills being readable by another.
 */

import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../auth/verifyToken.js", () => ({
  verifyAccessToken: async (token: string) => {
    if (!token.startsWith("user:")) return null;
    const id = token.slice("user:".length);
    return id ? { id, email: `${id}@example.com` } : null;
  },
}));

const { createApp } = await import("../app.js");
const app = createApp();

/** Authorization header for a test user. */
const asUser = (id: string) => ({ Authorization: `Bearer user:${id}` });

/** A complete, valid set of bill form fields. */
const validBill = {
  accountName: "Cafe Marie",
  provider: "Meralco",
  kwhUsed: "312",
  amount: "1785.50",
  periodStart: "2026-06-01",
  periodEnd: "2026-06-30",
};

/** Post a bill as a user, with the fields as multipart form data. */
function postBill(userId: string, fields: Record<string, string> = validBill) {
  const req = request(app).post("/api/bills").set(asUser(userId));
  for (const [key, value] of Object.entries(fields)) req.field(key, value);
  return req;
}

describe("authentication", () => {
  it("rejects a request with no token", async () => {
    const res = await request(app).get("/api/bills");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("NOT_AUTHENTICATED");
  });

  it("rejects a token it cannot verify", async () => {
    const res = await request(app).get("/api/bills").set({ Authorization: "Bearer forged" });
    expect(res.status).toBe(401);
  });

  it("rejects an Authorization header that isn't a bearer token", async () => {
    const res = await request(app).get("/api/bills").set({ Authorization: "user:alice" });
    expect(res.status).toBe(401);
  });

  it("accepts a verified token", async () => {
    const res = await request(app).get("/api/bills").set(asUser("auth-ok"));
    expect(res.status).toBe(200);
  });
});

describe("creating a bill", () => {
  it("stores it and returns it with an id and owner", async () => {
    const res = await postBill("creator");

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      accountName: "Cafe Marie",
      provider: "Meralco",
      kwhUsed: 312,
      amount: 1785.5,
    });
    expect(res.body.id).toBeTruthy();
    expect(res.body.userId).toBe("creator");
  });

  it("coerces the numeric fields out of form strings", async () => {
    const res = await postBill("coerce");
    expect(typeof res.body.kwhUsed).toBe("number");
    expect(typeof res.body.amount).toBe("number");
  });

  it("reports every missing field at once", async () => {
    const res = await request(app).post("/api/bills").set(asUser("empty"));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_FAILED");
    // A single round trip should tell the user everything to fix.
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        "accountName is required",
        "provider is required",
        "kwhUsed must be a non-negative number",
      ]),
    );
  });

  it("rejects negative usage", async () => {
    const res = await postBill("negative", { ...validBill, kwhUsed: "-5" });
    expect(res.status).toBe(400);
    expect(res.body.details).toContain("kwhUsed must be a non-negative number");
  });

  it("rejects a non-numeric amount", async () => {
    const res = await postBill("nan", { ...validBill, amount: "abc" });
    expect(res.status).toBe(400);
    expect(res.body.details).toContain("amount must be a non-negative number");
  });

  it("treats whitespace-only text as missing", async () => {
    const res = await postBill("blank", { ...validBill, accountName: "   " });
    expect(res.status).toBe(400);
    expect(res.body.details).toContain("accountName is required");
  });

  it("saves nothing when validation fails", async () => {
    await postBill("rejected", { ...validBill, accountName: "" });
    const list = await request(app).get("/api/bills").set(asUser("rejected"));
    expect(list.body).toEqual([]);
  });
});

describe("file attachments", () => {
  const png = Buffer.from("89504e470d0a1a0a", "hex");

  it("records the file's metadata but not its bytes", async () => {
    const res = await request(app)
      .post("/api/bills")
      .set(asUser("with-file"))
      .field(validBill)
      .attach("file", png, { filename: "june.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body.file).toMatchObject({ originalName: "june.png", mimeType: "image/png" });
    // The image itself is deliberately never stored.
    expect(JSON.stringify(res.body)).not.toContain("89504e47");
  });

  it("accepts a bill with no file at all", async () => {
    const res = await postBill("no-file");
    expect(res.status).toBe(201);
    expect(res.body.file).toBeNull();
  });

  it("rejects a file type that isn't an image or PDF", async () => {
    const res = await request(app)
      .post("/api/bills")
      .set(asUser("bad-type"))
      .field(validBill)
      .attach("file", Buffer.from("hello"), { filename: "notes.txt", contentType: "text/plain" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("rejects a file over the 10 MB cap", async () => {
    const tooBig = Buffer.alloc(11 * 1024 * 1024, 0);
    const res = await request(app)
      .post("/api/bills")
      .set(asUser("too-big"))
      .field(validBill)
      .attach("file", tooBig, { filename: "huge.png", contentType: "image/png" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("FILE_TOO_LARGE");
  });
});

describe("reading bills", () => {
  it("returns an empty list for a user with no bills", async () => {
    const res = await request(app).get("/api/bills").set(asUser("nobody"));
    expect(res.body).toEqual([]);
  });

  it("returns newest first", async () => {
    await postBill("ordered", { ...validBill, accountName: "First" });
    await postBill("ordered", { ...validBill, accountName: "Second" });

    const res = await request(app).get("/api/bills").set(asUser("ordered"));
    expect(res.body.map((b: { accountName: string }) => b.accountName)).toEqual([
      "Second",
      "First",
    ]);
  });

  it("fetches one bill by id", async () => {
    const created = await postBill("fetcher");
    const res = await request(app)
      .get(`/api/bills/${created.body.id}`)
      .set(asUser("fetcher"));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it("404s for an id that doesn't exist", async () => {
    const res = await request(app).get("/api/bills/does-not-exist").set(asUser("fetcher"));
    expect(res.status).toBe(404);
  });
});

describe("isolation between users", () => {
  let aliceBillId: string;

  beforeAll(async () => {
    const alice = await postBill("alice", { ...validBill, accountName: "Alice Cafe" });
    aliceBillId = alice.body.id;
    await postBill("bob", { ...validBill, accountName: "Bob Diner" });
  });

  it("shows each user only their own bills", async () => {
    const alice = await request(app).get("/api/bills").set(asUser("alice"));
    const bob = await request(app).get("/api/bills").set(asUser("bob"));

    expect(alice.body.map((b: { accountName: string }) => b.accountName)).toEqual(["Alice Cafe"]);
    expect(bob.body.map((b: { accountName: string }) => b.accountName)).toEqual(["Bob Diner"]);
  });

  it("hides another user's bill behind the same 404 as a missing one", async () => {
    // Not 403: that would confirm the id exists, letting someone probe for
    // valid ids.
    const res = await request(app).get(`/api/bills/${aliceBillId}`).set(asUser("bob"));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("BILL_NOT_FOUND");
  });
});
