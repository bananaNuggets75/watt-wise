/**
 * Domain types for the appliance survey.
 *
 * The survey records what appliances an account uses ("What appliances do you
 * use?" screen). This is the missing input for two recommendation rules that
 * already exist but had no data source: non-inverter units and aging units.
 *
 * A stored appliance is deliberately an `ApplianceInput` plus identifiers, so
 * a survey row can be handed to the recommendation engine as-is — no mapping
 * layer to keep in sync.
 */

import type { ApplianceInput } from "./recommendation.js";

/** What the survey form submits for one appliance. */
export interface ApplianceSurveyInput extends ApplianceInput {
  /** The account this appliance belongs to (same id bills are grouped by). */
  accountId: string;
}

/** A stored appliance: the survey input plus a server-assigned id. */
export interface Appliance extends ApplianceSurveyInput {
  id: string;
  createdAt: string;
}

export type { ApplianceInput };
