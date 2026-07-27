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
import type { Account, Bill, BillFileMeta, BillInput } from "../types/bill.js";

/** The backing array. Not exported — callers must go through the functions
 *  below so we can later swap this for a real database transparently. */
const bills: Bill[] = [];

/**
 * Maps a Customer Account Number to our internal accountId, so every bill
 * carrying the same CAN lands under one account. In a database this becomes
 * an `accounts` table with a unique index on the CAN.
 */
const accountIdByCan = new Map<string, string>();

/**
 * Resolve the accountId for a bill. Bills with the same CAN share an id;
 * a bill without a CAN can't be grouped, so it gets its own fresh account
 * (the user can merge it later by adding the number).
 */
function resolveAccountId(customerAccountNumber?: string): string {
  if (!customerAccountNumber) return randomUUID();
  const existing = accountIdByCan.get(customerAccountNumber);
  if (existing) return existing;
  const created = randomUUID();
  accountIdByCan.set(customerAccountNumber, created);
  return created;
}

/** Persist a new bill and return the stored record (with ids + timestamp). */
export function createBill(input: BillInput, file: BillFileMeta | null): Bill {
  const bill: Bill = {
    id: randomUUID(),
    accountId: resolveAccountId(input.customerAccountNumber),
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

/**
 * Group the stored bills into accounts. This is the read model behind a
 * month-by-month history: bills sharing a CAN come back under one account,
 * with the newest bill supplying the display name.
 */
export function listAccounts(): Account[] {
  const byAccountId = new Map<string, Account>();
  // listBills() is newest-first, so the first bill seen for an account is
  // the most recent one — its accountName wins.
  for (const bill of listBills()) {
    const existing = byAccountId.get(bill.accountId);
    if (existing) {
      existing.bills.push(bill);
    } else {
      byAccountId.set(bill.accountId, {
        id: bill.accountId,
        customerAccountNumber: bill.customerAccountNumber,
        accountName: bill.accountName,
        bills: [bill],
      });
    }
  }
  return [...byAccountId.values()];
}
