/**
 * Integration tests for the establishment survey routes.
 *
 * The store is mocked, so these cover what the route layer is responsible
 * for: auth, validation, and the mapping from a database failure to a
 * status the client can act on. The one behaviour worth guarding above all
 * is that the owning account comes from the verified token and never from
 * the request body — that is what stops a caller writing a row under
 * someone else's account.
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

const listEstablishmentTypes = vi.fn();
const listProviders = vi.fn();
const createEstablishment = vi.fn();
const listEstablishments = vi.fn();

// DatabaseError has to be the real class, since the route branches on it.
vi.mock("../store/establishmentStore.js", async () => {
  const actual = await vi.importActual<typeof import("../store/establishmentStore.js")>(
    "../store/establishmentStore.js",
  );
  return {
    DatabaseError: actual.DatabaseError,
    listEstablishmentTypes,
    listProviders,
    createEstablishment,
    listEstablishments,
  };
});

const { DatabaseError } = await import("../store/establishmentStore.js");
const { createApp } = await import("../app.js");
const app = createApp();

const asUser = (id: string) => ({ Authorization: `Bearer user:${id}` });

const TYPE_ID = "11111111-1111-1111-1111-111111111111";
const PROVIDER_ID = "22222222-2222-2222-2222-222222222222";

const validBody = {
  name: "Brew Corner Cafe",
  typeId: TYPE_ID,
  providerId: PROVIDER_ID,
  address: "12 Rizal St, Cebu City",
};

function post(userId: string, body: object) {
  return request(app).post("/api/establishments").set(asUser(userId)).send(body);
}

beforeEach(() => {
  vi.clearAllMocks();
  // The routes refuse to run at all without these; set them for every test.
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  createEstablishment.mockResolvedValue({ id: "est-1" });
  listEstablishmentTypes.mockResolvedValue([{ id: TYPE_ID, name: "Cafe" }]);
  listProviders.mockResolvedValue([
    { id: PROVIDER_ID, name: "Visayan Electric Company", acronym: "VECO" },
  ]);
  listEstablishments.mockResolvedValue([]);
});

describe("authentication", () => {
  it("rejects an unauthenticated create", async () => {
    expect((await request(app).post("/api/establishments").send(validBody)).status).toBe(401);
  });

  it("rejects an unauthenticated read of the lookup lists", async () => {
    expect((await request(app).get("/api/establishments/types")).status).toBe(401);
    expect((await request(app).get("/api/establishments/providers")).status).toBe(401);
  });
});

describe("lookup lists", () => {
  it("serves the establishment types", async () => {
    const res = await request(app).get("/api/establishments/types").set(asUser("u1"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: TYPE_ID, name: "Cafe" }]);
  });

  it("serves the electric utilities", async () => {
    const res = await request(app).get("/api/establishments/providers").set(asUser("u1"));

    expect(res.status).toBe(200);
    expect(res.body[0].acronym).toBe("VECO");
  });

  it("queries as the caller so RLS applies", async () => {
    // The store receives the raw token, not just the user id — that is what
    // keeps the database's policies in force behind the API.
    await request(app).get("/api/establishments/types").set(asUser("u1"));

    expect(listEstablishmentTypes).toHaveBeenCalledWith("user:u1");
  });
});

describe("creating an establishment", () => {
  it("saves a valid survey", async () => {
    const res = await post("u1", validBody);

    expect(res.status).toBe(201);
    expect(createEstablishment).toHaveBeenCalledWith("user:u1", "u1", {
      name: "Brew Corner Cafe",
      typeId: TYPE_ID,
      providerId: PROVIDER_ID,
      address: "12 Rizal St, Cebu City",
    });
  });

  it("takes the owner from the token, ignoring an accountId in the body", async () => {
    await post("u1", { ...validBody, accountId: "somebody-else" });

    expect(createEstablishment).toHaveBeenCalledWith(
      "user:u1",
      "u1",
      expect.not.objectContaining({ accountId: expect.anything() }),
    );
  });

  it("treats a blank address as absent", async () => {
    await post("u1", { ...validBody, address: "   " });

    expect(createEstablishment.mock.calls[0][2].address).toBeUndefined();
  });

  it("trims the name", async () => {
    await post("u1", { ...validBody, name: "  Home  " });

    expect(createEstablishment.mock.calls[0][2].name).toBe("Home");
  });
});

describe("validation", () => {
  it("requires a name", async () => {
    const res = await post("u1", { ...validBody, name: "   " });

    expect(res.status).toBe(400);
    expect(res.body.details).toContain("name is required");
    expect(createEstablishment).not.toHaveBeenCalled();
  });

  it("requires a type", async () => {
    const res = await post("u1", { ...validBody, typeId: "" });

    expect(res.status).toBe(400);
    expect(res.body.details).toContain("type is required");
  });

  it("requires an electric utility", async () => {
    const res = await post("u1", { ...validBody, providerId: "" });

    expect(res.status).toBe(400);
    expect(res.body.details).toContain("electric utility is required");
  });

  it("rejects an id that isn't a uuid", async () => {
    // Anything else can only be a client bug — the columns are uuid keys.
    const res = await post("u1", { ...validBody, providerId: "Meralco" });

    expect(res.status).toBe(400);
    expect(res.body.details).toContain("electric utility is not a valid selection");
  });

  it("reports every problem at once", async () => {
    const res = await post("u1", {});

    expect(res.body.details).toHaveLength(3);
  });
});

describe("database failures", () => {
  it("reports a stale option list as a 400, not a server fault", async () => {
    createEstablishment.mockRejectedValue(
      new DatabaseError('insert violates foreign key constraint "establishments_type_id_fkey"'),
    );

    const res = await post("u1", validBody);
    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatch(/no longer exists/);
  });

  it("reports an RLS refusal as a 403", async () => {
    createEstablishment.mockRejectedValue(
      new DatabaseError("new row violates row-level security policy for table \"establishments\""),
    );

    expect((await post("u1", validBody)).status).toBe(403);
  });

  it("reports an unreachable database as a 502", async () => {
    createEstablishment.mockRejectedValue(new DatabaseError("fetch failed"));

    const res = await post("u1", validBody);
    expect(res.status).toBe(502);
  });

  it("answers 503 when the project isn't configured", async () => {
    // A misconfigured deployment must not read as the caller's mistake.
    delete process.env.SUPABASE_ANON_KEY;

    const res = await post("u1", validBody);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("DATABASE_NOT_CONFIGURED");
  });
});
