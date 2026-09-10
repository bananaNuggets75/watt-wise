/**
 * Domain types for the utility bill upload / input module.
 *
 * A bill is one month's electricity statement for an establishment. The
 * user provides the numbers via a form, where OCR pre-fills what it can
 * read and the user confirms.
 *
 * These mirror public.bills in
 * supabase/migrations/20260814000300_establishments_bills_appliances.sql,
 * in camelCase — the snake_case columns are mapped in the store.
 *
 * The bill no longer carries an account name or a provider name of its own.
 * Both belong to the establishment it hangs off: one establishment is one
 * utility account, so repeating them per bill only created two versions of
 * the same fact that could disagree.
 */

/** Metadata about an uploaded bill file. We store the description of the
 *  file, not the bytes — the image itself is never persisted. */
export interface BillFileMeta {
  /** Original filename as sent by the browser, e.g. "june-2026.pdf". */
  originalName: string;
  /** MIME type, restricted to JPG / PNG / PDF at the route layer. */
  mimeType: string;
  /** File size in bytes (capped at 10 MB by the route layer). */
  size: number;
}

/** The numbers that describe a bill, as submitted by the form. */
export interface BillInput {
  /**
   * Which utility issued this statement. Optional: it is nearly always the
   * establishment's own provider, and the route fills that in when it is
   * omitted. Sent explicitly only when a statement names a different one.
   */
  providerId?: string;
  /**
   * Customer Account Number printed on the bill (Meralco calls it "CAN").
   * Recorded because it identifies the utility account a statement came
   * from, which helps match an upload to the right establishment.
   *
   * It is not how anything is grouped — establishments do that job. And it
   * is NOT a secret: it is printed on every bill, so it must never be
   * accepted as a credential.
   */
  customerAccountNumber?: string;
  /** Total energy consumed in kilowatt-hours for the period. */
  kwhUsed: number;
  /** Total amount billed, in the local currency (PHP for now). */
  amount: number;
  /** Billing period start (ISO date string, e.g. "2026-06-01"). */
  periodStart: string;
  /** Billing period end (ISO date string, e.g. "2026-06-30"). */
  periodEnd: string;
}

/** A stored bill. */
export interface Bill {
  id: string;
  /** The establishment this statement belongs to. */
  establishmentId: string;
  /** Null only for rows written before a provider was recorded. */
  providerId: string | null;
  customerAccountNumber?: string;
  kwhUsed: number;
  amount: number;
  /** Nullable in the schema: a scan doesn't always yield both dates. */
  periodStart: string | null;
  periodEnd: string | null;
  file: BillFileMeta | null;
  createdAt: string;
}
