/**
 * Establishments client.
 *
 * Like bills and appliances, this goes through apps/api rather than talking
 * to Supabase from the browser: validation, the account_id the row is
 * written under, and the mapping to the database's snake_case columns are
 * all backend concerns, and keeping them there means one place to change
 * when the schema moves.
 *
 * The routes live in apps/api/src/routes/establishments.ts.
 */

import { ApiError, apiUrl } from "./api";
import { authHeaders } from "./session";

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

/** An establishment as returned by the API. */
export interface Establishment {
  id: string;
  accountId: string;
  name: string;
  typeId: string;
  providerId: string;
  address?: string;
  createdAt: string;
}

/**
 * The label to show for a provider: the acronym is what people recognise
 * from their bill, but on its own it's opaque, so both are offered.
 */
export function providerLabel(provider: Provider): string {
  return provider.acronym ? `${provider.acronym} — ${provider.name}` : provider.name;
}

/** GET a path under /api/establishments, throwing ApiError on failure. */
async function getJson<T>(path: string, whatFailed: string): Promise<T> {
  const res = await fetch(apiUrl(path), { headers: await authHeaders() });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(data.message ?? data.error ?? whatFailed, res.status, data.details);
  }
  return data as T;
}

/** The establishment types on offer. */
export function listEstablishmentTypes(): Promise<EstablishmentType[]> {
  return getJson<EstablishmentType[]>(
    "/api/establishments/types",
    "Failed to load establishment types",
  );
}

/**
 * The electric utilities on offer. Served from the database, so a provider
 * added later (OCR can create ones that aren't seeded) appears here without
 * a frontend change.
 */
export function listProviders(): Promise<Provider[]> {
  return getJson<Provider[]>("/api/establishments/providers", "Failed to load providers");
}

/**
 * Create the signed-in user's establishment. The owning account is taken
 * from the access token by the API, so it isn't sent here.
 */
export async function createEstablishment(
  draft: EstablishmentDraft,
): Promise<Establishment> {
  const res = await fetch(apiUrl("/api/establishments"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({
      name: draft.name.trim(),
      typeId: draft.typeId,
      providerId: draft.providerId,
      address: draft.address.trim(),
    }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      data.message ?? data.error ?? "Failed to save your establishment",
      res.status,
      data.details,
    );
  }
  return data as Establishment;
}
