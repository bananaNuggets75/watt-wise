/**
 * Tests for the establishments client.
 *
 * The cases worth pinning are the ones a reader can't check by eye: that
 * account_id comes from the session rather than the caller (RLS rejects any
 * other value), that a blank address becomes null rather than "", and that
 * the snake_case row is mapped onto our camelCase shape.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const single = vi.fn();
const insertSelect = vi.fn(() => ({ single }));
const insert = vi.fn(() => ({ select: insertSelect }));
const order = vi.fn();
const selectQuery = vi.fn(() => ({ order }));
const from = vi.fn(() => ({ select: selectQuery, insert }));

vi.mock("./supabase", () => ({
  supabase: { auth: { getUser }, from },
  isSupabaseConfigured: true,
}));

const {
  createEstablishment,
  listEstablishmentTypes,
  listProviders,
  providerLabel,
} = await import("./establishments");

const draft = {
  name: "Brew Corner Cafe",
  typeId: "type-uuid-1",
  providerId: "provider-uuid-1",
  address: "12 Rizal St, Cebu City",
};

afterEach(() => vi.clearAllMocks());

describe("listEstablishmentTypes", () => {
  it("returns the seeded types", async () => {
    order.mockResolvedValue({ data: [{ id: "t1", name: "Cafe" }], error: null });

    await expect(listEstablishmentTypes()).resolves.toEqual([{ id: "t1", name: "Cafe" }]);
    expect(from).toHaveBeenCalledWith("establishment_types");
  });

  it("returns an empty list rather than null when there are no rows", async () => {
    // A null `data` would otherwise reach the page and break `.map`.
    order.mockResolvedValue({ data: null, error: null });

    await expect(listEstablishmentTypes()).resolves.toEqual([]);
  });

  it("surfaces the database error", async () => {
    order.mockResolvedValue({ data: null, error: { message: "permission denied" } });

    await expect(listEstablishmentTypes()).rejects.toThrow("permission denied");
  });
});

describe("listProviders", () => {
  it("reads the utilities from the database, not a hardcoded list", async () => {
    order.mockResolvedValue({
      data: [{ id: "p1", name: "Manila Electric Company", acronym: "Meralco" }],
      error: null,
    });

    await expect(listProviders()).resolves.toHaveLength(1);
    expect(from).toHaveBeenCalledWith("providers");
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
  it("owns the row with the signed-in user and maps the result", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-uuid-1" } }, error: null });
    single.mockResolvedValue({
      data: {
        id: "est-uuid-1",
        name: "Brew Corner Cafe",
        type_id: "type-uuid-1",
        provider_id: "provider-uuid-1",
        address: "12 Rizal St, Cebu City",
        created_at: "2026-08-22T00:00:00Z",
      },
      error: null,
    });

    await expect(createEstablishment(draft)).resolves.toEqual({
      id: "est-uuid-1",
      name: "Brew Corner Cafe",
      typeId: "type-uuid-1",
      providerId: "provider-uuid-1",
      address: "12 Rizal St, Cebu City",
      createdAt: "2026-08-22T00:00:00Z",
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: "user-uuid-1" }),
    );
  });

  it("stores a blank address as null, since the column is nullable", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-uuid-1" } }, error: null });
    single.mockResolvedValue({ data: { id: "e1", name: "Home", type_id: "t", provider_id: "p", address: null, created_at: "2026-08-22T00:00:00Z" }, error: null });

    await createEstablishment({ ...draft, name: "  Home  ", address: "   " });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Home", address: null }),
    );
  });

  it("refuses to insert when there is no session", async () => {
    // Without this the insert would go out with account_id undefined and
    // fail on a not-null violation the user can't act on.
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(createEstablishment(draft)).rejects.toMatchObject({ status: 401 });
    expect(insert).not.toHaveBeenCalled();
  });

  it("surfaces an RLS or constraint failure", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-uuid-1" } }, error: null });
    single.mockResolvedValue({
      data: null,
      error: { message: 'new row violates row-level security policy' },
    });

    await expect(createEstablishment(draft)).rejects.toThrow(/row-level security/);
  });
});
