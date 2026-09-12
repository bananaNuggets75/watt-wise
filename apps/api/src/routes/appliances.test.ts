/**
 * Integration tests for the appliance survey routes.
 *
 * The store is mocked, so these cover the route layer's own work: auth, the
 * ownership gate, validation, and the mapping from a database failure to a
 * status the client can act on.
 *
 * Two behaviours matter most. The establishment comes from the path and is
 * checked before anything is written; and a survey with one bad row saves
 * nothing at all, since a half-saved list would tell the recommendation
 * engine the user owns fewer appliances than they said.
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
vi.mock("../store/establishmentStore.js", () => ({
  getEstablishment,
  listEstablishmentTypes: vi.fn(),
  listProviders: vi.fn(),
  createEstablishment: vi.fn(),
  listEstablishments: vi.fn(),
}));

const createAppliances = vi.fn();
const listAppliances = vi.fn();
const deleteAppliance = vi.fn();
vi.mock("../store/applianceStore.js", () => ({
  createAppliances,
  listAppliances,
  deleteAppliance,
  listApplianceKinds: vi.fn(),
  listApplianceSubtypes: vi.fn(),
}));

const { DatabaseError } = await import("../store/supabaseClient.js");
const { createApp } = await import("../app.js");
const app = createApp();

const asUser = (id: string) => ({ Authorization: `Bearer user:${id}` });

const EST_ID = "33333333-3333-3333-3333-333333333333";
const KIND_ID = "66666666-6666-6666-6666-666666666666";
const SUBTYPE_ID = "77777777-7777-7777-7777-777777777777";
const APPLIANCE_ID = "88888888-8888-8888-8888-888888888888";

const establishment = {
  id: EST_ID,
  accountId: "u1",
  name: "Brew Corner Cafe",
  typeId: "11111111-1111-1111-1111-111111111111",
  providerId: "22222222-2222-2222-2222-222222222222",
  createdAt: "2026-06-01T00:00:00.000Z",
};

const url = `/api/establishments/${EST_ID}/appliances`;

const post = (userId: string, body: unknown) =>
  request(app).post(url).set(asUser(userId)).send(body as object);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  getEstablishment.mockResolvedValue(establishment);
  createAppliances.mockImplementation(async (_token, establishmentId, inputs) =>
    inputs.map((input: object, i: number) => ({ id: `a${i}`, establishmentId, ...input })),
  );
  listAppliances.mockResolvedValue([]);
  deleteAppliance.mockResolvedValue(true);
});

describe("authentication and ownership", () => {
  it("rejects an unauthenticated request", async () => {
    expect((await request(app).get(url)).status).toBe(401);
  });

  it("404s for an establishment that isn't the caller's, saving nothing", async () => {
    getEstablishment.mockResolvedValue(null);

    const res = await post("u1", { kindId: KIND_ID });

    expect(res.status).toBe(404);
    expect(createAppliances).not.toHaveBeenCalled();
  });
});

describe("saving a survey", () => {
  it("saves an array against the establishment named in the path", async () => {
    const res = await post("u1", [
      { kindId: KIND_ID, subtypeId: SUBTYPE_ID, count: 2 },
      { kindId: KIND_ID, count: 1, ageYears: 9 },
    ]);

    expect(res.status).toBe(201);
    expect(createAppliances).toHaveBeenCalledWith("user:u1", EST_ID, [
      { kindId: KIND_ID, subtypeId: SUBTYPE_ID, count: 2, ageYears: undefined },
      { kindId: KIND_ID, subtypeId: undefined, count: 1, ageYears: 9 },
    ]);
  });

  it("accepts a single appliance as well as a list", async () => {
    const res = await post("u1", { kindId: KIND_ID, count: 1 });

    expect(res.status).toBe(201);
    expect(createAppliances.mock.calls[0][2]).toHaveLength(1);
  });

  it("defaults the count to one, where the survey's counter starts", async () => {
    await post("u1", { kindId: KIND_ID });

    expect(createAppliances.mock.calls[0][2][0].count).toBe(1);
  });

  it("treats a blank variant as no variant", async () => {
    // A kind with no variants sends "" rather than omitting the field.
    await post("u1", { kindId: KIND_ID, subtypeId: "" });

    expect(createAppliances.mock.calls[0][2][0].subtypeId).toBeUndefined();
  });
});

describe("validation", () => {
  it("requires a kind", async () => {
    const res = await post("u1", { count: 1 });

    expect(res.status).toBe(400);
    expect(res.body.details).toContain("appliance 1: kind is required");
  });

  it("rejects an appliance name where an id belongs", async () => {
    const res = await post("u1", { kindId: "Air Conditioner" });

    expect(res.status).toBe(400);
    expect(res.body.details).toContain("appliance 1: kind is not a valid selection");
  });

  it("rejects a variant that isn't a selection", async () => {
    const res = await post("u1", { kindId: KIND_ID, subtypeId: "Inverter" });

    expect(res.status).toBe(400);
    expect(res.body.details).toContain("appliance 1: variant is not a valid selection");
  });

  it("rejects a fractional count", async () => {
    const res = await post("u1", { kindId: KIND_ID, count: 1.5 });

    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatch(/whole number/);
  });

  it("rejects a negative age", async () => {
    const res = await post("u1", { kindId: KIND_ID, ageYears: -3 });

    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatch(/ageYears/);
  });

  it("names the row that is wrong", async () => {
    // The survey shows a card per appliance; the position is how the client
    // knows which one to mark.
    const res = await post("u1", [{ kindId: KIND_ID }, { count: 1 }]);

    expect(res.body.details).toContain("appliance 2: kind is required");
  });

  it("saves nothing when any row is invalid", async () => {
    await post("u1", [{ kindId: KIND_ID }, {}]);

    expect(createAppliances).not.toHaveBeenCalled();
  });

  it("rejects an empty submission", async () => {
    const res = await post("u1", []);

    expect(res.status).toBe(400);
    expect(res.body.details).toContain("no appliances submitted");
  });
});

describe("reading and removing", () => {
  it("lists only this establishment's appliances", async () => {
    const res = await request(app).get(url).set(asUser("u1"));

    expect(res.status).toBe(200);
    expect(listAppliances).toHaveBeenCalledWith("user:u1", EST_ID);
  });

  it("removes one and answers 204", async () => {
    const res = await request(app).delete(`${url}/${APPLIANCE_ID}`).set(asUser("u1"));

    expect(res.status).toBe(204);
    expect(deleteAppliance).toHaveBeenCalledWith("user:u1", EST_ID, APPLIANCE_ID);
  });

  it("404s when nothing was removed", async () => {
    deleteAppliance.mockResolvedValue(false);

    const res = await request(app).delete(`${url}/${APPLIANCE_ID}`).set(asUser("u1"));

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("APPLIANCE_NOT_FOUND");
  });

  it("404s for a malformed id without querying", async () => {
    const res = await request(app).delete(`${url}/not-a-uuid`).set(asUser("u1"));

    expect(res.status).toBe(404);
    expect(deleteAppliance).not.toHaveBeenCalled();
  });
});

describe("database failures", () => {
  it("reports a subtype that doesn't belong to its kind as a 400", async () => {
    // appliances_subtype_matches_kind is a composite foreign key, so pairing
    // an Air Conditioner with "OLED" arrives as a foreign-key violation.
    createAppliances.mockRejectedValue(
      new DatabaseError(
        'insert violates foreign key constraint "appliances_subtype_matches_kind"',
      ),
    );

    const res = await post("u1", { kindId: KIND_ID, subtypeId: SUBTYPE_ID });

    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatch(/don't go together/);
  });

  it("reports an RLS refusal as a 403", async () => {
    createAppliances.mockRejectedValue(
      new DatabaseError('new row violates row-level security policy for table "appliances"'),
    );

    expect((await post("u1", { kindId: KIND_ID })).status).toBe(403);
  });

  it("reports an unreachable database as a 502", async () => {
    listAppliances.mockRejectedValue(new DatabaseError("fetch failed"));

    expect((await request(app).get(url).set(asUser("u1"))).status).toBe(502);
  });
});
