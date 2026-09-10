/**
 * Supabase-backed store for establishments and the two lookup lists the
 * onboarding survey offers.
 *
 * Unlike billStore and applianceStore, which are still in-memory, this one
 * talks to Postgres: establishments must survive a restart, because every
 * bill and appliance a user records is anchored to one.
 *
 * Every function takes the caller's access token and queries as them, so
 * Row-Level Security applies — see supabaseClient.ts for why that is the
 * chosen shape rather than a service-role client.
 */

import { DatabaseError, userClient } from "./supabaseClient.js";
import type {
  Establishment,
  EstablishmentInput,
  EstablishmentType,
  Provider,
} from "../types/establishment.js";

/** The row shape Postgres returns, before mapping to our camelCase type. */
interface EstablishmentRow {
  id: string;
  account_id: string;
  name: string;
  type_id: string;
  provider_id: string;
  address: string | null;
  created_at: string;
}

/** Map a row onto the domain type; a null address becomes undefined. */
function toEstablishment(row: EstablishmentRow): Establishment {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    typeId: row.type_id,
    providerId: row.provider_id,
    address: row.address ?? undefined,
    createdAt: row.created_at,
  };
}

/** The columns a select needs to build an Establishment. */
const ESTABLISHMENT_COLUMNS = "id, account_id, name, type_id, provider_id, address, created_at";

/** The establishment types on offer, alphabetical. */
export async function listEstablishmentTypes(
  accessToken: string,
): Promise<EstablishmentType[]> {
  const { data, error } = await userClient(accessToken)
    .from("establishment_types")
    .select("id, name")
    .order("name");

  if (error) throw new DatabaseError(error.message);
  return data ?? [];
}

/**
 * The electric utilities on offer, alphabetical.
 *
 * Read from the table rather than a constant here: the list is open to rows
 * added at runtime, since OCR regularly reads a cooperative that isn't
 * seeded yet and blocking that would stop a bill being saved.
 */
export async function listProviders(accessToken: string): Promise<Provider[]> {
  const { data, error } = await userClient(accessToken)
    .from("providers")
    .select("id, name, acronym")
    .order("name");

  if (error) throw new DatabaseError(error.message);
  return data ?? [];
}

/**
 * Create an establishment owned by the given user.
 *
 * account_id is set from the verified token rather than from the request
 * body, so a caller can't create a row under someone else's account. RLS
 * would reject that anyway; doing it here means the request fails with a
 * clear 401/403 rather than an opaque policy violation.
 *
 * A blank address is stored as null — the column is nullable, and "" would
 * read as an address that exists but is empty.
 */
export async function createEstablishment(
  accessToken: string,
  accountId: string,
  input: EstablishmentInput,
): Promise<Establishment> {
  const { data, error } = await userClient(accessToken)
    .from("establishments")
    .insert({
      account_id: accountId,
      name: input.name,
      type_id: input.typeId,
      provider_id: input.providerId,
      address: input.address?.trim() || null,
    })
    .select(ESTABLISHMENT_COLUMNS)
    .single();

  if (error) throw new DatabaseError(error.message);
  return toEstablishment(data as EstablishmentRow);
}

/**
 * The user's establishments, newest first. No account filter is applied
 * here — RLS already restricts the result to rows this token owns.
 */
export async function listEstablishments(
  accessToken: string,
): Promise<Establishment[]> {
  const { data, error } = await userClient(accessToken)
    .from("establishments")
    .select(ESTABLISHMENT_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) throw new DatabaseError(error.message);
  return (data ?? []).map((row) => toEstablishment(row as EstablishmentRow));
}
