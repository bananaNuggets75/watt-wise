/**
 * Integration tests for the recommendation endpoint.
 *
 * This route is deliberately open: it scores data supplied in the request
 * and reads nothing from storage, so there is no per-user data to protect.
 * That decision is pinned by a test here, so removing the auth gate stays a
 * conscious choice rather than an accident.
 */

import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

const app = createApp();

const validProfile = {
  accountName: "Cafe Marie",
  kwhUsed: 312,
  amount: 1785.5,
};

function post(body: unknown) {
  return request(app).post("/api/recommendations").send(body);
}

describe("access", () => {
  it("is reachable without a token, by design", async () => {
    // It computes from the request body and touches no stored data.
    expect((await post(validProfile)).status).toBe(200);
  });
});

describe("validation", () => {
  it("requires the identifying and numeric fields", async () => {
    const res = await post({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_FAILED");
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        "accountName is required",
        "kwhUsed must be a non-negative number",
        "amount must be a non-negative number",
      ]),
    );
  });

  it("rejects negative usage", async () => {
    const res = await post({ ...validProfile, kwhUsed: -1 });
    expect(res.status).toBe(400);
  });

  it("handles a completely empty request body", async () => {
    const res = await request(app).post("/api/recommendations");
    expect(res.status).toBe(400);
  });

  it("ignores optional fields that are empty rather than failing", async () => {
    const res = await post({ ...validProfile, peerAverageKwh: "", baselineKwh: null });
    expect(res.status).toBe(200);
    // Falls back to the default benchmark.
    expect(res.body.benchmark.peerAverageKwh).toBe(265);
  });
});

describe("scoring a profile", () => {
  it("returns a score, a label and a benchmark", async () => {
    const res = await post(validProfile);

    expect(res.body).toMatchObject({
      accountName: "Cafe Marie",
      engine: "rule-based-v1",
    });
    expect(res.body.healthScore).toBeGreaterThanOrEqual(0);
    expect(res.body.healthScore).toBeLessThanOrEqual(100);
    expect(["Good", "Fair", "Poor"]).toContain(res.body.healthLabel);
    expect(res.body.benchmark).toHaveProperty("deltaPct");
  });

  it("names which engine produced the result", async () => {
    // The UI and any future LLM engine both rely on this being reported.
    expect((await post(validProfile)).body.engine).toBe("rule-based-v1");
  });

  it("returns recommendations shaped for the Priority Actions screen", async () => {
    const res = await post({ ...validProfile, eveningUsageSharePct: 38 });
    const [rec] = res.body.recommendations;

    expect(rec).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      description: expect.any(String),
      category: expect.any(String),
    });
    expect(["high", "medium", "low"]).toContain(rec.impact);
  });

  it("uses appliances passed in the request", async () => {
    const res = await post({
      ...validProfile,
      appliances: [{ type: "Air Conditioner", count: 2, isInverter: false, ageYears: 9 }],
    });

    const ids = res.body.recommendations.map((r: { id: string }) => r.id);
    expect(ids).toContain("non-inverter-appliances");
    expect(ids).toContain("aging-appliances");
  });

  it("ignores an appliances value that isn't an array", async () => {
    const res = await post({ ...validProfile, appliances: "not-an-array" });
    expect(res.status).toBe(200);
  });

  it("gives an efficient profile a clean bill of health", async () => {
    const res = await post({ accountName: "Small Kiosk", kwhUsed: 180, amount: 900 });

    expect(res.body.healthScore).toBe(100);
    expect(res.body.recommendations).toEqual([]);
  });
});
