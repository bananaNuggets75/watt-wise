/**
 * Tests for the establishments client.
 *
 * The module is a thin wrapper over fetch now that validation and ownership
 * live in the API, so what's worth pinning is the wire contract: the right
 * paths, an Authorization header on every call, no account id invented on
 * the client, and the API's `details` array surviving onto ApiError so the
 * form can list them.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authHeaders = vi.fn(async () => ({ Authorization: "Bearer test-token" }));
vi.mock("./session", () => ({ authHeaders, getAccessToken: async () => "test-token" }));

const {
  createEstablishment,
  listEstablishmentTypes,
  listProviders,
  providerLabel,
} = await import("./establishments");

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

/** Shorthand for a fetch response. */
function respond(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

const draft = {
  name: "Brew Corner Cafe",
  typeId: "11111111-1111-1111-1111-111111111111",
  providerId: "22222222-2222-2222-2222-222222222222",
  address: "12 Rizal St, Cebu City",
};

describe("listEstablishmentTypes", () => {
  it("reads the types from the API", async () => {
    fetchMock.mockReturnValue(respond(200, [{ id: "t1", name: "Cafe" }]));

    await expect(listEstablishmentTypes()).resolves.toEqual([{ id: "t1", name: "Cafe" }]);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/establishments/types");
  });

  it("sends the access token", async () => {
    fetchMock.mockReturnValue(respond(200, []));
    await listEstablishmentTypes();

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: "Bearer test-token",
    });
  });

  it("throws with the API's status when the read fails", async () => {
    fetchMock.mockReturnValue(respond(503, { message: "The server can't reach the database." }));

    await expect(listEstablishmentTypes()).rejects.toMatchObject({
      status: 503,
      message: "The server can't reach the database.",
    });
  });
});

describe("listProviders", () => {
  it("reads the utilities from the API", async () => {
    fetchMock.mockReturnValue(
      respond(200, [{ id: "p1", name: "Manila Electric Company", acronym: "Meralco" }]),
    );

    await expect(listProviders()).resolves.toHaveLength(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/establishments/providers");
  });
});

describe("providerLabel", () => {
  it("leads with the acronym, which is what the bill prints", () => {
    expect(
      providerLabel({ id: "p1", name: "Visayan Electric Company", acronym: "VECO" }),
    ).toBe("VECO — Visayan Electric Company");
  });

  it("falls back to the full name when there is no acronym", () => {
    expect(providerLabel({ id: "p2", name: "Some Cooperative", acronym: null })).toBe(
      "Some Cooperative",
    );
  });
});

describe("createEstablishment", () => {
  it("posts the survey and returns the saved establishment", async () => {
    fetchMock.mockReturnValue(
      respond(201, {
        id: "est-1",
        accountId: "user-1",
        name: "Brew Corner Cafe",
        typeId: draft.typeId,
        providerId: draft.providerId,
        address: draft.address,
        createdAt: "2026-08-22T00:00:00Z",
      }),
    );

    await expect(createEstablishment(draft)).resolves.toMatchObject({ id: "est-1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/establishments");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      name: "Brew Corner Cafe",
      typeId: draft.typeId,
      providerId: draft.providerId,
      address: "12 Rizal St, Cebu City",
    });
  });

  it("does not send an account id — the API takes it from the token", async () => {
    fetchMock.mockReturnValue(respond(201, {}));
    await createEstablishment(draft);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("accountId");
  });

  it("trims the name and address before sending", async () => {
    fetchMock.mockReturnValue(respond(201, {}));
    await createEstablishment({ ...draft, name: "  Home  ", address: "   " });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      name: "Home",
      address: "",
    });
  });

  it("surfaces the API's per-field details for the form to list", async () => {
    fetchMock.mockReturnValue(
      respond(400, { error: "VALIDATION_FAILED", details: ["name is required"] }),
    );

    await expect(createEstablishment(draft)).rejects.toMatchObject({
      status: 400,
      details: ["name is required"],
    });
  });

  it("copes with an error response that isn't JSON", async () => {
    fetchMock.mockReturnValue(
      Promise.resolve({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      }),
    );

    await expect(createEstablishment(draft)).rejects.toThrow(
      "Failed to save your establishment",
    );
  });
});
