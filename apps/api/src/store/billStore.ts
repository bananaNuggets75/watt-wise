/**
 * Supabase-backed store for bills.
 *
 * Every function takes the caller's access token and queries as them, so
 * Row-Level Security applies — see supabaseClient.ts for why that is the
 * chosen shape rather than a service-role client.
 *
 * Reads are also narrowed to one establishment. That is not a second
 * security check (RLS already restricts the rows to the caller's own
 * establishments); it is what makes a query mean "this cafe's history"
 * rather than "everything this user has ever uploaded".
 */

import { DatabaseError, userClient } from "./supabaseClient.js";
import type { Bill, BillFileMeta, BillInput } from "../types/bill.js";

/** The row shape Postgres returns, before mapping to our camelCase type. */
interface BillRow {
  id: string;
  establishment_id: string;
  provider_id: string | null;
  customer_account_number: string | null;
  kwh_used: number | string;
  amount: number | string;
  period_start: string | null;
  period_end: string | null;
  file_name: string | null;
  file_mime_type: string | null;
  file_size: number | null;
  created_at: string;
}

/**
 * The columns a select needs to build a Bill. One string literal, not a
 * concatenation: supabase-js reads the select list at the type level, and a
 * joined string defeats that, leaving every result typed as an error.
 */
const BILL_COLUMNS =
  "id, establishment_id, provider_id, customer_account_number, kwh_used, amount, period_start, period_end, file_name, file_mime_type, file_size, created_at";

/**
 * Map a row onto the domain type.
 *
 * kwh_used and amount are `numeric` columns. PostgREST sends those as JSON
 * numbers, but coerce anyway: a string slipping through would turn every
 * arithmetic in the recommendation engine into string concatenation, and
 * "312" + 40 is a bug that reads as a plausible number.
 */
function toBill(row: BillRow): Bill {
  return {
    id: row.id,
    establishmentId: row.establishment_id,
    providerId: row.provider_id,
    customerAccountNumber: row.customer_account_number ?? undefined,
    kwhUsed: Number(row.kwh_used),
    amount: Number(row.amount),
    periodStart: row.period_start,
    periodEnd: row.period_end,
    // The three file columns are written together or not at all, so the
    // name standing in for all of them is safe.
    file: row.file_name
      ? {
          originalName: row.file_name,
          mimeType: row.file_mime_type ?? "",
          size: row.file_size ?? 0,
        }
      : null,
    createdAt: row.created_at,
  };
}

/**
 * Record a bill against an establishment.
 *
 * The establishment id comes from the route path, which requireEstablishment
 * has already confirmed belongs to the caller — it is never read from the
 * body, so a caller can't file a bill under someone else's establishment.
 */
export async function createBill(
  accessToken: string,
  establishmentId: string,
  input: BillInput,
  file: BillFileMeta | null,
): Promise<Bill> {
  const { data, error } = await userClient(accessToken)
    .from("bills")
    .insert({
      establishment_id: establishmentId,
      provider_id: input.providerId ?? null,
      // A blank CAN is stored as null: "" would read as a number that
      // exists and is empty.
      customer_account_number: input.customerAccountNumber?.trim() || null,
      kwh_used: input.kwhUsed,
      amount: input.amount,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      file_name: file?.originalName ?? null,
      file_mime_type: file?.mimeType ?? null,
      file_size: file?.size ?? null,
    })
    .select(BILL_COLUMNS)
    .single();

  if (error) throw new DatabaseError(error.message);
  return toBill(data as BillRow);
}

/**
 * One establishment's bills, most recent billing period first.
 *
 * Ordered by period rather than created_at: a user catching up on three
 * months of paperwork in one sitting uploads them in whatever order the
 * pile is in, and the history should still read chronologically. created_at
 * breaks the tie so the order is stable when periods match.
 */
export async function listBills(
  accessToken: string,
  establishmentId: string,
): Promise<Bill[]> {
  const { data, error } = await userClient(accessToken)
    .from("bills")
    .select(BILL_COLUMNS)
    .eq("establishment_id", establishmentId)
    .order("period_end", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw new DatabaseError(error.message);
  return (data ?? []).map((row) => toBill(row as BillRow));
}

/**
 * One bill, or null when the caller can't see it.
 *
 * Filtering by establishment as well as id means a bill of the caller's own
 * still 404s when asked for under the wrong establishment — the id in the
 * path has to describe where the bill actually is.
 */
export async function getBill(
  accessToken: string,
  establishmentId: string,
  id: string,
): Promise<Bill | null> {
  const { data, error } = await userClient(accessToken)
    .from("bills")
    .select(BILL_COLUMNS)
    .eq("establishment_id", establishmentId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new DatabaseError(error.message);
  return data ? toBill(data as BillRow) : null;
}
