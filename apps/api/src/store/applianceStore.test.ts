/**
 * Tests for the appliance store's mapping.
 *
 * Rows hold kind and subtype ids; the recommendation engine reasons over
 * names and an inverter flag. This is where those meet, and the case that
 * matters is the one that looks like a detail: a kind with no inverter
 * variant must come back `undefined`, never `false`.
 *
 * Get that wrong and the engine reports "non-inverter appliances may be
 * driving up costs" over a ceiling fan and an OLED television — advice
 * about units the user never claimed to own, in a product whose whole
 * output is advice.
 *
 * Supabase is faked at the client boundary, so the query shapes and the
 * mapping are both real code.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/** Rows each table returns, and an optional error to raise instead. */
const tables: Record<string, { rows?: unknown[]; error?: { message: string } }> = {};

/**
 * A stand-in for the supabase-js query builder: every method returns the
 * builder, and awaiting it yields whatever the table was primed with.
 */
function builder(table: string) {
  const result = () => ({
    data: tables[table]?.error ? null : (tables[table]?.rows ?? []),
    error: tables[table]?.error ?? null,
  });
  const chain: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => resolve(result()),
  };
  for (const method of ["select", "eq", "order", "insert", "delete"]) {
    chain[method] = () => chain;
  }
  return chain;
}

vi.mock("./supabaseClient.js", async () => {
  const actual =
    await vi.importActual<typeof import("./supabaseClient.js")>("./supabaseClient.js");
  return { ...actual, userClient: () => ({ from: builder }) };
});

const { DatabaseError } = await import("./supabaseClient.js");
const { createAppliances, deleteAppliance, listAppliances } = await import(
  "./applianceStore.js"
);

const EST_ID = "33333333-3333-3333-3333-333333333333";
const AIRCON = "66666666-6666-6666-6666-666666666666";
const TV = "99999999-9999-9999-9999-999999999999";
const FAN = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const INVERTER = "77777777-7777-7777-7777-777777777777";
const NON_INVERTER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OLED = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

/** One appliance row, with the columns the store selects. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "88888888-8888-8888-8888-888888888888",
    establishment_id: EST_ID,
    kind_id: AIRCON,
    subtype_id: null,
    quantity: 1,
    age_years: null,
    created_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  tables.appliance_kinds = {
    rows: [
      { id: AIRCON, appliance_name: "Air Conditioner", has_subtype: true },
      { id: TV, appliance_name: "Television", has_subtype: true },
      { id: FAN, appliance_name: "Ceiling Fan", has_subtype: false },
    ],
  };
  tables.appliance_subtypes = {
    rows: [
      { id: INVERTER, kind_id: AIRCON, subtype_name: "Inverter" },
      { id: NON_INVERTER, kind_id: AIRCON, subtype_name: "Non-inverter" },
      { id: OLED, kind_id: TV, subtype_name: "OLED" },
    ],
  };
});

describe("the inverter flag", () => {
  it("is true for an inverter unit", async () => {
    tables.appliances = { rows: [row({ subtype_id: INVERTER })] };

    const [appliance] = await listAppliances("token", EST_ID);

    expect(appliance.isInverter).toBe(true);
  });

  it("is false for a unit the user said is non-inverter", async () => {
    tables.appliances = { rows: [row({ subtype_id: NON_INVERTER })] };

    const [appliance] = await listAppliances("token", EST_ID);

    expect(appliance.isInverter).toBe(false);
  });

  it("is undefined for a variant that isn't about inverters at all", async () => {
    // An OLED television is not a non-inverter appliance. The engine filters
    // on `isInverter === false`, so false here would have it recommend
    // replacing a TV on grounds that don't apply to televisions.
    tables.appliances = { rows: [row({ kind_id: TV, subtype_id: OLED })] };

    const [appliance] = await listAppliances("token", EST_ID);

    expect(appliance.isInverter).toBeUndefined();
  });

  it("is undefined for a kind with no variants at all", async () => {
    tables.appliances = { rows: [row({ kind_id: FAN, subtype_id: null })] };

    const [appliance] = await listAppliances("token", EST_ID);

    expect(appliance.isInverter).toBeUndefined();
  });
});

describe("mapping a row for the recommendation engine", () => {
  it("resolves the kind's name, which the rules group by", async () => {
    tables.appliances = { rows: [row({ kind_id: TV, subtype_id: OLED })] };

    const [appliance] = await listAppliances("token", EST_ID);

    expect(appliance.type).toBe("Television");
  });

  it("renames quantity to the count the engine reads", async () => {
    tables.appliances = { rows: [row({ quantity: 4 })] };

    const [appliance] = await listAppliances("token", EST_ID);

    expect(appliance.count).toBe(4);
  });

  it("reports an unanswered age as absent rather than zero", async () => {
    // The aging-unit rule treats a missing age as unknown; zero would read
    // as a brand-new appliance, which is a different claim.
    tables.appliances = { rows: [row({ age_years: null })] };

    const [appliance] = await listAppliances("token", EST_ID);

    expect(appliance.ageYears).toBeUndefined();
  });

  it("keeps the ids, so the client can show the survey's own selections", async () => {
    tables.appliances = { rows: [row({ subtype_id: INVERTER })] };

    const [appliance] = await listAppliances("token", EST_ID);

    expect(appliance.kindId).toBe(AIRCON);
    expect(appliance.subtypeId).toBe(INVERTER);
  });
});

describe("saving a survey", () => {
  it("returns the saved rows mapped for the engine", async () => {
    tables.appliances = { rows: [row({ subtype_id: NON_INVERTER, quantity: 2 })] };

    const saved = await createAppliances("token", EST_ID, [
      { kindId: AIRCON, subtypeId: NON_INVERTER, count: 2 },
    ]);

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ type: "Air Conditioner", count: 2, isInverter: false });
  });
});

describe("removing an appliance", () => {
  it("reports false when the delete matched nothing", async () => {
    // Without asking for the deleted rows back, a delete that matched
    // nothing is indistinguishable from one that matched.
    tables.appliances = { rows: [] };

    expect(await deleteAppliance("token", EST_ID, "id")).toBe(false);
  });

  it("reports true when a row was removed", async () => {
    tables.appliances = { rows: [{ id: "88888888-8888-8888-8888-888888888888" }] };

    expect(await deleteAppliance("token", EST_ID, "id")).toBe(true);
  });
});

describe("when a query fails", () => {
  it("raises a DatabaseError the route can classify", async () => {
    tables.appliances = { error: { message: "fetch failed" } };

    await expect(listAppliances("token", EST_ID)).rejects.toBeInstanceOf(DatabaseError);
  });
});
