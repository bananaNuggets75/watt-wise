/**
 * Supabase-backed store for the appliance survey.
 *
 * Mirrors billStore: every function queries as the caller so Row-Level
 * Security applies, and reads are narrowed to one establishment so a query
 * means "this cafe's appliances" rather than everything the user owns.
 *
 * Rows hold kind and subtype ids; the recommendation engine reasons over
 * names. The translation happens here, on the way out, so the engine's
 * input shape is unchanged by the survey having moved to lookup tables.
 */

import { DatabaseError, userClient } from "./supabaseClient.js";
import type {
  Appliance,
  ApplianceKind,
  ApplianceSubtype,
  ApplianceSurveyInput,
} from "../types/appliance.js";

/** The row shape Postgres returns for an appliance. */
interface ApplianceRow {
  id: string;
  establishment_id: string;
  kind_id: string;
  subtype_id: string | null;
  quantity: number;
  age_years: number | null;
  created_at: string;
}

const APPLIANCE_COLUMNS =
  "id, establishment_id, kind_id, subtype_id, quantity, age_years, created_at";

/** The appliance kinds the survey offers, alphabetical. */
export async function listApplianceKinds(accessToken: string): Promise<ApplianceKind[]> {
  const { data, error } = await userClient(accessToken)
    .from("appliance_kinds")
    .select("id, appliance_name, has_subtype")
    .order("appliance_name");

  if (error) throw new DatabaseError(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    applianceName: row.appliance_name as string,
    hasSubtype: row.has_subtype as boolean,
  }));
}

/**
 * Every appliance subtype, with the kind it belongs to.
 *
 * Returned as one flat list rather than one request per kind: there are a
 * dozen rows in total, and the survey needs all of them up front to build
 * dropdowns that react to the chosen kind without a round trip each time.
 */
export async function listApplianceSubtypes(
  accessToken: string,
): Promise<ApplianceSubtype[]> {
  const { data, error } = await userClient(accessToken)
    .from("appliance_subtypes")
    .select("id, kind_id, subtype_name")
    .order("subtype_name");

  if (error) throw new DatabaseError(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    kindId: row.kind_id as string,
    subtypeName: row.subtype_name as string,
  }));
}

/**
 * Whether a subtype describes an inverter model.
 *
 * Undefined — not false — for anything else, and that distinction is the
 * whole point. A ceiling fan has no subtype and a television's is "OLED";
 * neither is a non-inverter appliance. Returning false for them would have
 * the engine recommend replacing units the user never claimed to own.
 */
function toIsInverter(subtypeName: string | undefined): boolean | undefined {
  if (subtypeName === "Inverter") return true;
  if (subtypeName === "Non-inverter") return false;
  return undefined;
}

/**
 * The lookup rows an appliance's names are resolved from.
 *
 * Fetched alongside the appliances rather than embedded in the query.
 * PostgREST can join these, but `appliances` has two foreign keys to
 * appliance_subtypes — the plain one and the composite pair that keeps a
 * subtype matched to its kind — which makes an embed ambiguous and would
 * tie this code to auto-generated constraint names. The lookup tables are
 * seeded reference data of about twenty rows; reading them is cheap.
 */
interface NameIndex {
  kinds: Map<string, ApplianceKind>;
  subtypes: Map<string, ApplianceSubtype>;
}

async function loadNameIndex(accessToken: string): Promise<NameIndex> {
  const [kinds, subtypes] = await Promise.all([
    listApplianceKinds(accessToken),
    listApplianceSubtypes(accessToken),
  ]);
  return {
    kinds: new Map(kinds.map((k) => [k.id, k])),
    subtypes: new Map(subtypes.map((s) => [s.id, s])),
  };
}

/** Map a row onto the domain type, resolving the names the engine reads. */
function toAppliance(row: ApplianceRow, names: NameIndex): Appliance {
  const subtypeName = row.subtype_id
    ? names.subtypes.get(row.subtype_id)?.subtypeName
    : undefined;

  return {
    id: row.id,
    establishmentId: row.establishment_id,
    kindId: row.kind_id,
    subtypeId: row.subtype_id,
    // Empty only if a kind were deleted mid-flight, which the schema's
    // `on delete restrict` prevents.
    type: names.kinds.get(row.kind_id)?.applianceName ?? "",
    count: row.quantity,
    isInverter: toIsInverter(subtypeName),
    ageYears: row.age_years ?? undefined,
    createdAt: row.created_at,
  };
}

/** Turn one survey answer into the row Postgres stores. */
function toRow(establishmentId: string, input: ApplianceSurveyInput) {
  return {
    establishment_id: establishmentId,
    kind_id: input.kindId,
    subtype_id: input.subtypeId ?? null,
    quantity: input.count,
    age_years: input.ageYears ?? null,
  };
}

/**
 * Save a whole survey against one establishment.
 *
 * Inserted in a single call so a survey lands complete or not at all — a
 * half-saved list would tell the engine the user owns fewer appliances than
 * they said, which is worse than nothing.
 *
 * A subtype that doesn't belong to its kind is rejected by the
 * appliances_subtype_matches_kind constraint rather than checked here: the
 * database is where that pairing is defined, so it is the one place that
 * can't be bypassed or fall out of date.
 */
export async function createAppliances(
  accessToken: string,
  establishmentId: string,
  inputs: ApplianceSurveyInput[],
): Promise<Appliance[]> {
  const client = userClient(accessToken);
  const { data, error } = await client
    .from("appliances")
    .insert(inputs.map((input) => toRow(establishmentId, input)))
    .select(APPLIANCE_COLUMNS);

  if (error) throw new DatabaseError(error.message);

  const names = await loadNameIndex(accessToken);
  return (data ?? []).map((row) => toAppliance(row as ApplianceRow, names));
}

/** One establishment's appliances, newest first. */
export async function listAppliances(
  accessToken: string,
  establishmentId: string,
): Promise<Appliance[]> {
  const { data, error } = await userClient(accessToken)
    .from("appliances")
    .select(APPLIANCE_COLUMNS)
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false });

  if (error) throw new DatabaseError(error.message);

  const names = await loadNameIndex(accessToken);
  return (data ?? []).map((row) => toAppliance(row as ApplianceRow, names));
}

/**
 * Remove one appliance. Returns false when nothing was deleted, which
 * covers both "no such id" and "not this establishment's" — RLS makes them
 * the same, and the route turns both into a 404.
 */
export async function deleteAppliance(
  accessToken: string,
  establishmentId: string,
  id: string,
): Promise<boolean> {
  const { data, error } = await userClient(accessToken)
    .from("appliances")
    .delete()
    .eq("establishment_id", establishmentId)
    .eq("id", id)
    // Ask for the deleted rows back: without a select, a delete that
    // matched nothing is indistinguishable from one that matched.
    .select("id");

  if (error) throw new DatabaseError(error.message);
  return (data ?? []).length > 0;
}
