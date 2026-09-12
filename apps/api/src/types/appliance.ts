/**
 * Domain types for the appliance survey.
 *
 * The survey records what appliances an establishment uses ("What appliances
 * do you use?"). This is the input for two recommendation rules that already
 * exist but had no data source: non-inverter units and aging units.
 *
 * These mirror public.appliances in
 * supabase/migrations/20260814000300_establishments_bills_appliances.sql,
 * in camelCase — the snake_case columns are mapped in the store.
 *
 * The survey submits ids from the lookup tables rather than free text, so
 * "Aircon", "aircon" and "Air Conditioner" can't all arrive as different
 * appliances. The names are joined back on read, because that is what the
 * recommendation engine reasons over.
 */

import type { ApplianceInput } from "./recommendation.js";

/** A kind of appliance offered by the survey: Air Conditioner, Lighting. */
export interface ApplianceKind {
  id: string;
  /** Display name, and what the recommendation engine groups by. */
  applianceName: string;
  /**
   * Whether this kind has variants to choose from. False for a ceiling fan,
   * which has no inverter/non-inverter or bulb-type distinction at all —
   * the survey shows no selector for it.
   */
  hasSubtype: boolean;
}

/** A variant of one kind: Inverter, Non-inverter, LED/LCD, OLED, CRT. */
export interface ApplianceSubtype {
  id: string;
  /** The kind this variant belongs to; a subtype is never offered alone. */
  kindId: string;
  subtypeName: string;
}

/** What the survey form submits for one appliance. */
export interface ApplianceSurveyInput {
  kindId: string;
  /** Absent when the kind has no variants, or the user skipped the detail. */
  subtypeId?: string;
  /** How many of this appliance are in use. Stored as `quantity`. */
  count: number;
  /** Approximate age in years; older units tend to be less efficient. */
  ageYears?: number;
}

/**
 * A stored appliance.
 *
 * It extends ApplianceInput so a survey row can be handed to the
 * recommendation engine as-is: `type` and `isInverter` are the names and
 * flags the rules read, resolved from the lookup tables on the way out.
 */
export interface Appliance extends ApplianceInput {
  id: string;
  /** The establishment this appliance belongs to. */
  establishmentId: string;
  kindId: string;
  subtypeId: string | null;
  createdAt: string;
}

export type { ApplianceInput };
