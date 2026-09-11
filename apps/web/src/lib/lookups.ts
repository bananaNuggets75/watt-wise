/**
 * Reference data for the appliance survey, read from Supabase.
 *
 * These lists used to be hardcoded in the component, which meant adding an
 * appliance kind required a code change and a deploy. They now come from the
 * `appliance_kinds` and `appliance_subtypes` tables, so the options are data.
 *
 * Read straight from Supabase rather than through our API: these tables live
 * only in Postgres, the API has no Supabase client, and the row-level
 * security policies already let any signed-in user read them.
 */

import { supabase } from "./supabase";

/** A general kind of appliance — "Air Conditioner", "Television". */
export interface ApplianceKind {
  id: string;
  applianceName: string;
  /** Whether this kind has variants worth asking about. Drives whether the
   *  form shows a subtype selector at all, instead of hardcoding which
   *  appliances happen to have one. */
  hasSubtype: boolean;
}

/** A variant of a kind — "Inverter", "OLED". Filtered by the chosen kind. */
export interface ApplianceSubtype {
  id: string;
  kindId: string;
  subtypeName: string;
}

export interface ApplianceOptions {
  kinds: ApplianceKind[];
  subtypes: ApplianceSubtype[];
}

/**
 * Load every appliance kind and subtype in one go.
 *
 * Both are small, fixed lists, so fetching them together once beats querying
 * subtypes again each time the user changes a dropdown.
 */
export async function fetchApplianceOptions(): Promise<ApplianceOptions> {
  const [kindsResult, subtypesResult] = await Promise.all([
    supabase
      .from("appliance_kinds")
      .select("id, appliance_name, has_subtype")
      .order("appliance_name"),
    supabase
      .from("appliance_subtypes")
      .select("id, kind_id, subtype_name")
      .order("subtype_name"),
  ]);

  if (kindsResult.error) throw new Error(kindsResult.error.message);
  if (subtypesResult.error) throw new Error(subtypesResult.error.message);

  return {
    // Postgres columns are snake_case; the app is camelCase. Mapping here
    // keeps that difference from leaking into the components.
    kinds: (kindsResult.data ?? []).map((row) => ({
      id: row.id as string,
      applianceName: row.appliance_name as string,
      hasSubtype: Boolean(row.has_subtype),
    })),
    subtypes: (subtypesResult.data ?? []).map((row) => ({
      id: row.id as string,
      kindId: row.kind_id as string,
      subtypeName: row.subtype_name as string,
    })),
  };
}

/** The subtypes belonging to one kind. */
export function subtypesForKind(
  subtypes: ApplianceSubtype[],
  kindId: string | undefined,
): ApplianceSubtype[] {
  if (!kindId) return [];
  return subtypes.filter((s) => s.kindId === kindId);
}

/**
 * Map a subtype name onto the boolean the recommendation engine's
 * non-inverter rule reads.
 *
 * The schema models variants generally ("OLED", "CRT"), but the engine still
 * asks a yes/no question about inverters. Anything that isn't an explicit
 * inverter answer stays undefined rather than defaulting to false — the rule
 * must not treat "unknown" as "not an inverter".
 */
export function toIsInverter(subtypeName: string | undefined): boolean | undefined {
  if (subtypeName === "Inverter") return true;
  if (subtypeName === "Non-inverter") return false;
  return undefined;
}
