/**
 * Domain types for the utility bill upload / input module.
 *
 * A "bill" represents one month's electricity statement for a location
 * (e.g. "Cafe Marie"). For MVP v1 the user provides the numbers manually
 * via a form; an optional scanned file (image/PDF) can be attached for
 * record-keeping. Automatic extraction (OCR) is a later phase.
 */

/** Metadata about an uploaded bill file. We store the description of the
 *  file, not the bytes — actual file persistence/OCR comes later. */
export interface BillFileMeta {
  /** Original filename as sent by the browser, e.g. "june-2026.pdf". */
  originalName: string;
  /** MIME type, restricted to JPG / PNG / PDF at the route layer. */
  mimeType: string;
  /** File size in bytes (capped at 10 MB by the route layer). */
  size: number;
}

/** The manually-entered numbers that describe a bill. These feed the
 *  dashboard and, later, the AI recommendation engine. */
export interface BillInput {
  /** Which account/location this bill belongs to, e.g. "Cafe Marie".
   *  Display label only — it is not an identifier (names repeat and OCR
   *  spells them inconsistently). Grouping uses the CAN below. */
  accountName: string;
  /**
   * Customer Account Number printed on the bill (Meralco calls it "CAN").
   * The utility's own stable identifier for the account, so two bills with
   * the same CAN belong to the same account. Optional: not every bill
   * format shows one, and the user may skip it.
   *
   * NOT a secret — it is printed on every bill, so it must never be used
   * as a credential. It groups bills; it does not authenticate anyone.
   */
  customerAccountNumber?: string;
  /** Electricity provider / utility company name. */
  provider: string;
  /** Total energy consumed in kilowatt-hours for the period. */
  kwhUsed: number;
  /** Total amount billed, in the local currency (PHP for now). */
  amount: number;
  /** Billing period start (ISO date string, e.g. "2026-06-01"). */
  periodStart: string;
  /** Billing period end (ISO date string, e.g. "2026-06-30"). */
  periodEnd: string;
}

/** A stored bill: the user's input plus a server-assigned id, an optional
 *  attached file's metadata, and a created timestamp. */
export interface Bill extends BillInput {
  id: string;
  /**
   * The user who uploaded this bill. Every read is filtered by it, so one
   * user's bills are never visible to another. Under Supabase this becomes
   * the `user_id` column that the Row-Level Security policies check.
   */
  userId: string;
  /**
   * Our internal account identifier. Bills sharing a customerAccountNumber
   * get the same accountId, which is how a month-by-month history is tied
   * together without any login.
   *
   * This is also the future link to auth: when Supabase Auth lands, an
   * account gains a userId and every bill under this accountId comes with
   * it — no reshaping of the bill data required.
   */
  accountId: string;
  file: BillFileMeta | null;
  createdAt: string;
}

/** An account: a group of bills that share a Customer Account Number. */
export interface Account {
  /** Our internal id (what bills reference). */
  id: string;
  /** The CAN this account was grouped by, if the bills carried one. */
  customerAccountNumber?: string;
  /** Display name taken from the most recent bill. */
  accountName: string;
  /** Bills under this account, newest first. */
  bills: Bill[];
}
