/**
 * In-memory store for appliance survey entries.
 *
 * Mirrors billStore: a plain array behind functions, so swapping in Supabase
 * (the `appliances` table already exists in supabase/schema.sql) only changes
 * this file. Data resets on restart, which is fine for local dev and demos.
 */

import { randomUUID } from "node:crypto";
import type { Appliance, ApplianceSurveyInput } from "../types/appliance.js";

/** Backing array — private so callers go through the functions below. */
const appliances: Appliance[] = [];

/** Persist one appliance for a user and return the stored record. */
export function createAppliance(
  userId: string,
  input: ApplianceSurveyInput,
): Appliance {
  const appliance: Appliance = {
    id: randomUUID(),
    userId,
    ...input,
    createdAt: new Date().toISOString(),
  };
  appliances.push(appliance);
  return appliance;
}

/**
 * List appliances, newest first. Pass an accountId to get just that account's
 * appliances — which is what the recommendation engine needs when scoring one
 * account.
 */
export function listAppliances(userId: string, accountId?: string): Appliance[] {
  return appliances
    .filter((a) => a.userId === userId && (!accountId || a.accountId === accountId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Remove one of the user's appliances. Returns false for an id belonging to
 * someone else, so another user's row can't be deleted by guessing its id.
 */
export function deleteAppliance(userId: string, id: string): boolean {
  const index = appliances.findIndex((a) => a.id === id && a.userId === userId);
  if (index === -1) return false;
  appliances.splice(index, 1);
  return true;
}
