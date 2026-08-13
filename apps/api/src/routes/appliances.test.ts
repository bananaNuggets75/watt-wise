/**
 * Integration tests for the appliance survey routes.
 *
 * The survey submits several cards in one request, so the behaviour that
 * matters is the batch contract: everything is validated before anything is
 * saved, and errors identify which card is wrong.
 */

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../auth/verifyToken.js", () => ({
  verifyAccessToken: async (token: string) => {
    if (!token.startsWith("user:")) return null;
    const id = token.slice("user:".length);
    return id ? { id, email: `${id}@example.com` } : null;
  },
}));

const { createApp } = await import("../app.js");
const app = createApp();

const asUser = (id: string) => ({ Authorization: `Bearer user:${id}` });

function postAppliances(userId: string, body: unknown) {
  return request(app).post("/api/appliances").set(asUser(userId)).send(body);
}

describe("authentication", () => {
  it("rejects an unauthenticated submission", async () => {
    const res = await request(app).post("/api/appliances").send([{ type: "TV", count: 1 }]);
    expect(res.status).toBe(401);
  });

  it("rejects an unauthenticated read", async () => {
    expect((await request(app).get("/api/appliances")).status).toBe(401);
  });
});

describe("submitting a survey", () => {
  it("saves a whole list in one request", async () => {
    const res = await postAppliances("batch", [
      { type: "Air Conditioner", count: 2, isInverter: false, ageYears: 9 },
      { type: "Television", count: 1, isInverter: true, ageYears: 3 },
    ]);

    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ type: "Air Conditioner", count: 2, isInverter: false });
    expect(res.body[0].userId).toBe("batch");
  });

  it("accepts a single appliance sent as an object", async () => {
    const res = await postAppliances("single", { type: "Refrigerator", count: 1 });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(1);
  });

  it("defaults the count to 1", async () => {
    const res = await postAppliances("default-count", { type: "Electric Fan" });
    expect(res.body[0].count).toBe(1);
  });

  it("leaves optional details undefined when not answered", async () => {
    const res = await postAppliances("optional", { type: "Water Heater", count: 1 });
    expect(res.body[0].isInverter).toBeUndefined();
    expect(res.body[0].ageYears).toBeUndefined();
  });

  it("assigns a placeholder account when none is given", async () => {
    const res = await postAppliances("placeholder", { type: "Lighting", count: 4 });
    expect(res.body[0].accountId).toBe("00000000-0000-0000-0000-000000000000");
  });
});

describe("validation", () => {
  it("requires a type", async () => {
    const res = await postAppliances("no-type", [{ count: 1 }]);
    expect(res.status).toBe(400);
    expect(res.body.details).toContain("appliance 1: type is required");
  });

  it("names the offending card so the UI can point at it", async () => {
    const res = await postAppliances("which-card", [
      { type: "Refrigerator", count: 1 },
      { type: "", count: 1 },
    ]);

    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatch(/^appliance 2:/);
  });

  it("rejects a fractional count", async () => {
    const res = await postAppliances("fraction", [{ type: "TV", count: 1.5 }]);
    expect(res.status).toBe(400);
    expect(res.body.details).toContain("appliance 1: count must be a whole number of at least 1");
  });

  it("rejects a count below one", async () => {
    const res = await postAppliances("zero", [{ type: "TV", count: 0 }]);
    expect(res.status).toBe(400);
  });

  it("rejects a negative age", async () => {
    const res = await postAppliances("neg-age", [{ type: "TV", count: 1, ageYears: -2 }]);
    expect(res.status).toBe(400);
    expect(res.body.details).toContain("appliance 1: ageYears must be a non-negative number");
  });

  it("rejects an empty submission", async () => {
    const res = await postAppliances("empty-list", []);
    expect(res.status).toBe(400);
  });

  it("saves nothing when any card is invalid", async () => {
    // The whole point of validating up front: a survey must not half-save.
    await postAppliances("all-or-nothing", [
      { type: "Refrigerator", count: 1 },
      { type: "", count: 0 },
    ]);

    const list = await request(app).get("/api/appliances").set(asUser("all-or-nothing"));
    expect(list.body).toEqual([]);
  });
});

describe("reading and deleting", () => {
  it("lists only the requesting user's appliances", async () => {
    await postAppliances("owner-a", [{ type: "Air Conditioner", count: 1 }]);
    await postAppliances("owner-b", [{ type: "Television", count: 1 }]);

    const a = await request(app).get("/api/appliances").set(asUser("owner-a"));
    const b = await request(app).get("/api/appliances").set(asUser("owner-b"));

    expect(a.body.map((x: { type: string }) => x.type)).toEqual(["Air Conditioner"]);
    expect(b.body.map((x: { type: string }) => x.type)).toEqual(["Television"]);
  });

  it("filters by accountId when asked", async () => {
    await postAppliances("filterer", [
      { type: "Air Conditioner", count: 1, accountId: "acct-1" },
      { type: "Television", count: 1, accountId: "acct-2" },
    ]);

    const res = await request(app)
      .get("/api/appliances?accountId=acct-1")
      .set(asUser("filterer"));

    expect(res.body.map((x: { type: string }) => x.type)).toEqual(["Air Conditioner"]);
  });

  it("deletes an entry", async () => {
    const created = await postAppliances("deleter", [{ type: "Electric Fan", count: 1 }]);
    const id = created.body[0].id;

    expect((await request(app).delete(`/api/appliances/${id}`).set(asUser("deleter"))).status).toBe(204);
    const list = await request(app).get("/api/appliances").set(asUser("deleter"));
    expect(list.body).toEqual([]);
  });

  it("will not delete another user's entry", async () => {
    const created = await postAppliances("victim", [{ type: "Water Heater", count: 1 }]);
    const id = created.body[0].id;

    const res = await request(app).delete(`/api/appliances/${id}`).set(asUser("attacker"));
    expect(res.status).toBe(404);

    // And it's still there for its owner.
    const list = await request(app).get("/api/appliances").set(asUser("victim"));
    expect(list.body).toHaveLength(1);
  });
});
