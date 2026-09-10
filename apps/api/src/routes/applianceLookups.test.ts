/**
 * Tests for the lists the appliance survey is built from.
 *
 * These are shared reference data, so the thing to pin is that they sit
 * outside the establishment tree — the survey needs them before a place has
 * been chosen — while still requiring a sign-in, because their RLS policies
 * only grant `select` to the authenticated role.
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

const listApplianceKinds = vi.fn();
const listApplianceSubtypes = vi.fn();
vi.mock("../store/applianceStore.js", () => ({
  listApplianceKinds,
  listApplianceSubtypes,
  createAppliances: vi.fn(),
  listAppliances: vi.fn(),
  deleteAppliance: vi.fn(),
}));

const { createApp } = await import("../app.js");
const app = createApp();

const asUser = (id: string) => ({ Authorization: `Bearer user:${id}` });

const AIRCON_ID = "66666666-6666-6666-6666-666666666666";
const TV_ID = "99999999-9999-9999-9999-999999999999";

const kinds = [
  { id: AIRCON_ID, applianceName: "Air Conditioner", hasSubtype: true },
  { id: TV_ID, applianceName: "Television", hasSubtype: true },
];

const subtypes = [
  { id: "77777777-7777-7777-7777-777777777777", kindId: AIRCON_ID, subtypeName: "Inverter" },
  { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", kindId: AIRCON_ID, subtypeName: "Non-inverter" },
  { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", kindId: TV_ID, subtypeName: "OLED" },
];

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  listApplianceKinds.mockResolvedValue(kinds);
  listApplianceSubtypes.mockResolvedValue(subtypes);
});

describe("authentication", () => {
  it("rejects an unauthenticated read", async () => {
    expect((await request(app).get("/api/appliances/kinds")).status).toBe(401);
    expect((await request(app).get("/api/appliances/subtypes")).status).toBe(401);
  });
});

describe("the kind list", () => {
  it("serves every kind, with whether it has variants", async () => {
    const res = await request(app).get("/api/appliances/kinds").set(asUser("u1"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(kinds);
  });

  it("reads as the caller, so RLS applies", async () => {
    await request(app).get("/api/appliances/kinds").set(asUser("u1"));

    expect(listApplianceKinds).toHaveBeenCalledWith("user:u1");
  });
});

describe("the variant list", () => {
  it("serves every variant with the kind it belongs to", async () => {
    const res = await request(app).get("/api/appliances/subtypes").set(asUser("u1"));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });

  it("narrows to one kind on request", async () => {
    const res = await request(app)
      .get(`/api/appliances/subtypes?kindId=${TV_ID}`)
      .set(asUser("u1"));

    expect(res.body).toEqual([expect.objectContaining({ subtypeName: "OLED" })]);
  });

  it("rejects a filter that isn't a selection", async () => {
    // Returning everything would look like the filter had worked.
    const res = await request(app)
      .get("/api/appliances/subtypes?kindId=Television")
      .set(asUser("u1"));

    expect(res.status).toBe(400);
    expect(res.body.details).toContain("kindId is not a valid selection");
  });
});
