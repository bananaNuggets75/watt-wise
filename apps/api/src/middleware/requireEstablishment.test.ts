/**
 * Tests for the establishment-ownership gate.
 *
 * This is the check that keeps one account's bills and appliances out of
 * another's, so the case that matters most is the boring one: an id the
 * caller doesn't own must be indistinguishable from an id that doesn't
 * exist. Anything else lets someone map out which establishments are real.
 *
 * Driven through a minimal app rather than the real routers, so it still
 * holds if the route layout changes again.
 */

import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getEstablishment = vi.fn();
vi.mock("../store/establishmentStore.js", () => ({ getEstablishment }));

const { DatabaseError } = await import("../store/supabaseClient.js");
const { requireEstablishment } = await import("./requireEstablishment.js");

const EST_ID = "33333333-3333-3333-3333-333333333333";
const establishment = { id: EST_ID, accountId: "u1", name: "Brew Corner Cafe" };

/** A stand-in for the routes this middleware guards. */
const app = express();
// requireAuth normally puts these there; this test is about what happens
// after a caller is already known.
app.use((req, _res, next) => {
  req.accessToken = "user:u1";
  next();
});
app.get("/e/:establishmentId/things", requireEstablishment, (req, res) => {
  res.json({ establishment: req.establishment });
});
app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: "INTERNAL_ERROR" });
});

const get = (id: string) => request(app).get(`/e/${id}/things`);

beforeEach(() => {
  vi.clearAllMocks();
  getEstablishment.mockResolvedValue(establishment);
});

describe("when the establishment is the caller's", () => {
  it("lets the request through with the establishment attached", async () => {
    const res = await get(EST_ID);

    expect(res.status).toBe(200);
    expect(res.body.establishment).toEqual(establishment);
  });

  it("looks it up as the caller, so RLS decides what is visible", async () => {
    await get(EST_ID);

    expect(getEstablishment).toHaveBeenCalledWith("user:u1", EST_ID);
  });
});

describe("when the establishment isn't the caller's", () => {
  it("answers 404, the same as one that doesn't exist", async () => {
    // RLS filters another account's row out of the query, so null is all
    // the store can report — and a 403 here would confirm the id is real.
    getEstablishment.mockResolvedValue(null);

    const res = await get(EST_ID);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("ESTABLISHMENT_NOT_FOUND");
  });
});

describe("when the id is malformed", () => {
  it("answers 404 without querying at all", async () => {
    // Postgres would raise "invalid input syntax for type uuid" on a where
    // clause, which would read as a server fault rather than a bad path.
    const res = await get("not-a-uuid");

    expect(res.status).toBe(404);
    expect(getEstablishment).not.toHaveBeenCalled();
  });
});

describe("when the lookup fails", () => {
  it("reports an unreachable database as a 502", async () => {
    getEstablishment.mockRejectedValue(new DatabaseError("fetch failed"));

    expect((await get(EST_ID)).status).toBe(502);
  });

  it("sends an unexpected failure to the error handler", async () => {
    // Not a database error, so it is a bug in our code — it has to reach
    // the error handler and get a response, not hang the request.
    getEstablishment.mockRejectedValue(new TypeError("undefined is not a function"));

    const res = await get(EST_ID);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("INTERNAL_ERROR");
  });
});
