/**
 * In-memory store for bills (MVP v1).
 *
 * This keeps everything in a plain array so the module runs with zero
 * external setup. It is intentionally a thin, swappable layer: when we
 * wire up Supabase (next phase), only this file changes — the routes and
 * the rest of the app keep calling the same functions.
 *
 * Caveat: data lives in process memory, so it resets on every server
 * restart. That's fine for local development and demos.
 */

import { randomUUID } from "node:crypto";
import type { Bill, BillFileMeta, BillInput } from "../types/bill.js";

/** The backing array. Not exported — callers must go through the functions
 *  below so we can later swap this for a real database transparently. */
const bills: Bill[] = [];

/** Persist a new bill and return the stored record (with id + timestamp). */
export function createBill(input: BillInput, file: BillFileMeta | null): Bill {
  const bill: Bill = {
    id: randomUUID(),
    ...input,
    file,
    createdAt: new Date().toISOString(),
  };
  bills.push(bill);
  return bill;
}

/** Return all bills, newest first. */
export function listBills(): Bill[] {
  return [...bills].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Look up a single bill by id, or undefined if not found. */
export function getBill(id: string): Bill | undefined {
  return bills.find((b) => b.id === id);
}
