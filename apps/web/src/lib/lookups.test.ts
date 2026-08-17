/**
 * Tests for the appliance option lookups.
 *
 * Two things here are quietly load-bearing: the snake_case-to-camelCase
 * mapping (a typo yields `undefined` in a dropdown rather than an error),
 * and the inverter translation, where treating "unknown" as "not an
 * inverter" would make the engine accuse people of owning inefficient
 * appliances they never told us about.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const from = vi.fn();
vi.mock("./supabase", () => ({
  supabase: { from: (table: string) => from(table) },
  isSupabaseConfigured: true,
}));

const { fetchApplianceOptions, subtypesForKind, toIsInverter } = await import("./lookups");

/** Stub the two table reads the loader performs. */
function mockTables(kinds: unknown, subtypes: unknown, errors: Record<string, string> = {}) {
  from.mockImplementation((table: string) => ({
    select: () => ({
      order: async () =>
        table === "appliance_kinds"
          ? { data: kinds, error: errors.kinds ? { message: errors.kinds } : null }
          : { data: subtypes, error: errors.subtypes ? { message: errors.subtypes } : null },
    }),
  }));
}

afterEach(() => vi.clearAllMocks());

describe("loading the options", () => {
  it("maps the database columns onto the app's names", async () => {
    mockTables(
      [{ id: "k1", appliance_name: "Air Conditioner", has_subtype: true }],
      [{ id: "s1", kind_id: "k1", subtype_name: "Inverter" }],
    );

    const { kinds, subtypes } = await fetchApplianceOptions();

    expect(kinds[0]).toEqual({ id: "k1", applianceName: "Air Conditioner", hasSubtype: true });
    expect(subtypes[0]).toEqual({ id: "s1", kindId: "k1", subtypeName: "Inverter" });
  });

  it("reads both tables", async () => {
    mockTables([], []);
    await fetchApplianceOptions();

    expect(from).toHaveBeenCalledWith("appliance_kinds");
    expect(from).toHaveBeenCalledWith("appliance_subtypes");
  });

  it("copes with empty tables rather than throwing", async () => {
    mockTables([], []);
    await expect(fetchApplianceOptions()).resolves.toEqual({ kinds: [], subtypes: [] });
  });

  it("treats a null payload as empty", async () => {
    mockTables(null, null);
    await expect(fetchApplianceOptions()).resolves.toEqual({ kinds: [], subtypes: [] });
  });

  it("surfaces a query error instead of rendering an empty dropdown", async () => {
    // Silently showing no appliances would look like a product with no
    // options, not a failed request.
    mockTables(null, null, { kinds: "permission denied for table appliance_kinds" });
    await expect(fetchApplianceOptions()).rejects.toThrow(/permission denied/);
  });

  it("surfaces a subtype query error too", async () => {
    mockTables([], null, { subtypes: "relation does not exist" });
    await expect(fetchApplianceOptions()).rejects.toThrow(/relation does not exist/);
  });

  it("coerces has_subtype to a real boolean", async () => {
    mockTables([{ id: "k1", appliance_name: "Electric Fan", has_subtype: null }], []);
    const { kinds } = await fetchApplianceOptions();

    expect(kinds[0].hasSubtype).toBe(false);
  });
});

describe("filtering subtypes by kind", () => {
  const subtypes = [
    { id: "s1", kindId: "ac", subtypeName: "Inverter" },
    { id: "s2", kindId: "ac", subtypeName: "Non-inverter" },
    { id: "s3", kindId: "tv", subtypeName: "OLED" },
  ];

  it("returns only the chosen kind's variants", () => {
    // An air conditioner must never offer "OLED".
    expect(subtypesForKind(subtypes, "ac").map((s) => s.subtypeName)).toEqual([
      "Inverter",
      "Non-inverter",
    ]);
  });

  it("returns nothing for a kind with no variants", () => {
    expect(subtypesForKind(subtypes, "fan")).toEqual([]);
  });

  it("returns nothing when no kind is selected", () => {
    expect(subtypesForKind(subtypes, undefined)).toEqual([]);
  });
});

describe("translating a subtype for the engine", () => {
  it("recognises an inverter", () => {
    expect(toIsInverter("Inverter")).toBe(true);
  });

  it("recognises a non-inverter", () => {
    expect(toIsInverter("Non-inverter")).toBe(false);
  });

  it("leaves unrelated variants undefined", () => {
    // "OLED" says nothing about inverters. Returning false would make the
    // engine claim the user owns non-inverter appliances they never reported.
    expect(toIsInverter("OLED")).toBeUndefined();
    expect(toIsInverter("CRT")).toBeUndefined();
  });

  it("leaves an unanswered subtype undefined", () => {
    expect(toIsInverter(undefined)).toBeUndefined();
  });
});
