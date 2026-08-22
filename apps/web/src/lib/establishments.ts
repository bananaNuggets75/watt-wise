/**
 * Establishments client, backed by Supabase directly.
 *
 * Unlike bills and appliances, establishments don't go through apps/api:
 * the table and its two lookup lists (establishment_types, providers) live
 * in Postgres with RLS policies that already scope writes to the signed-in
 * user, so an extra hop through the Node API would add nothing but latency.
 *
 * See supabase/migrations/20260814000200_lookup_tables.sql for the seeded
 * option lists and 20260814000300_* for the establishments table.
 */

import { ApiError } from "./api";
import { isSupabaseConfigured, supabase } from "./supabase";

/** Shown when the project hasn't been configured, instead of a network error. */
const NOT_CONFIGURED =
  "Supabase isn't configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to apps/web/.env.";

/** A kind of place — Household, Cafe, Office. Also drives peer benchmarking. */
export interface EstablishmentType {
  id: string;
  name: string;
}

/** An electric distribution utility or cooperative. */
export interface Provider {
  id: string;
  name: string;
  /** Short form printed on bills ("Meralco"); null for providers without one. */
  acronym: string | null;
}

/** What the setup form collects before submitting. */
export interface EstablishmentDraft {
  name: string;
  typeId: string;
  providerId: string;
  address: string;
}

/** An establishment as stored. */
export interface Establishment {
  id: string;
  name: string;
  typeId: string;
  providerId: string;
  address: string | null;
  createdAt: string;
}

/**
 * The label to show for a provider: the acronym is what people recognise
 * from their bill, but on its own it's opaque, so both are offered.
 */
export function providerLabel(provider: Provider): string {
  return provider.acronym ? `${provider.acronym} — ${provider.name}` : provider.name;
}

/** The establishment types on offer, alphabetical. */
export async function listEstablishmentTypes(): Promise<EstablishmentType[]> {
  if (!isSupabaseConfigured) throw new ApiError(NOT_CONFIGURED, 500);

  const { data, error } = await supabase
    .from("establishment_types")
    .select("id, name")
    .order("name");

  if (error) throw new ApiError(error.message, 400);
  return data ?? [];
}

/**
 * The electric utilities on offer, alphabetical. The table is seeded with
 * the major ones but stays open to rows added at runtime (OCR reads
 * cooperatives that aren't listed yet), so this reads whatever is there
 * rather than a hardcoded list.
 */
export async function listProviders(): Promise<Provider[]> {
  if (!isSupabaseConfigured) throw new ApiError(NOT_CONFIGURED, 500);

  const { data, error } = await supabase
    .from("providers")
    .select("id, name, acronym")
    .order("name");

  if (error) throw new ApiError(error.message, 400);
  return data ?? [];
}

/**
 * Create the establishment for the signed-in user.
 *
 * account_id is set from the current session rather than passed in: RLS
 * would reject any other value anyway, and taking it from a caller invites
 * a bug where the wrong id is sent and the insert fails opaquely.
 *
 * Address is optional in the schema, so a blank one is stored as null
 * instead of an empty string.
 */
export async function createEstablishment(
  draft: EstablishmentDraft,
): Promise<Establishment> {
  if (!isSupabaseConfigured) throw new ApiError(NOT_CONFIGURED, 500);

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new ApiError("You need to be signed in to do that.", 401);
  }

  const { data, error } = await supabase
    .from("establishments")
    .insert({
      account_id: userData.user.id,
      name: draft.name.trim(),
      type_id: draft.typeId,
      provider_id: draft.providerId,
      address: draft.address.trim() || null,
    })
    .select("id, name, type_id, provider_id, address, created_at")
    .single();

  if (error) throw new ApiError(error.message, 400);

  return {
    id: data.id,
    name: data.name,
    typeId: data.type_id,
    providerId: data.provider_id,
    address: data.address,
    createdAt: data.created_at,
  };
}
