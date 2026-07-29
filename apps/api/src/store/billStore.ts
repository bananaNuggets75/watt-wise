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
function resolveAccountId(userId: string, customerAccountNumber?: string): string {
  if (!customerAccountNumber) return randomUUID();
  // Scope the key to the user: two people can hold bills for the same CAN
  // (a shared meter, a reused sample bill) and must not end up sharing an
  // account.
  const key = `${userId}::${customerAccountNumber}`;
  const existing = accountIdByCan.get(key);
  if (existing) return existing;
  const created = randomUUID();
  accountIdByCan.set(key, created);
  return created;
}

/** Persist a new bill for a user and return the stored record. */
export function createBill(
  userId: string,
  input: BillInput,
  file: BillFileMeta | null,
): Bill {
  const bill: Bill = {
    id: randomUUID(),
    userId,
    accountId: resolveAccountId(userId, input.customerAccountNumber),
    ...input,
    file,
    createdAt: new Date().toISOString(),
  };
  bills.push(bill);
  return bill;
}

/** Return the user's bills, newest first. */
export function listBills(userId: string): Bill[] {
  return bills
    .filter((b) => b.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Look up one of the user's bills. Returns undefined for a bill belonging to
 * someone else, so a guessed id reveals nothing — the route turns that into
 * the same 404 as a genuinely missing bill.
 */
export function getBill(userId: string, id: string): Bill | undefined {
  return bills.find((b) => b.id === id && b.userId === userId);
}

/**
 * Group the stored bills into accounts. This is the read model behind a
 * month-by-month history: bills sharing a CAN come back under one account,
 * with the newest bill supplying the display name.
 */
export function listAccounts(userId: string): Account[] {
  const byAccountId = new Map<string, Account>();
  // listBills() is newest-first, so the first bill seen for an account is
  // the most recent one — its accountName wins.
  for (const bill of listBills(userId)) {
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
