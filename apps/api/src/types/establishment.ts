/**
 * Domain types for establishments — the place whose electricity is tracked.
 *
 * An establishment is the layer that owns data: bills and appliances both
 * hang off one, so a user with two cafes keeps their figures separate. Its
 * type and provider are required columns, which is why it is created during
 * onboarding rather than by the signup trigger.
 *
 * These mirror public.establishments in
 * supabase/migrations/20260814000300_establishments_bills_appliances.sql,
 * in camelCase — the snake_case columns are mapped in the store.
 */

/** A kind of place: Household, Cafe, Office. Also the benchmarking cohort. */
export interface EstablishmentType {
  id: string;
  name: string;
}

/** An electric distribution utility or cooperative. */
export interface Provider {
  id: string;
  name: string;
  /** Short form printed on bills ("Meralco"); null when it has none. */
  acronym: string | null;
}

/** What the onboarding survey submits. */
export interface EstablishmentInput {
  name: string;
  typeId: string;
  providerId: string;
  /** Optional — benchmarking widens its comparison when it is absent. */
  address?: string;
}

/** A stored establishment. */
export interface Establishment extends EstablishmentInput {
  id: string;
  /** The owning account — the same uuid auth.uid() returns in RLS. */
  accountId: string;
  address?: string;
  createdAt: string;
}
