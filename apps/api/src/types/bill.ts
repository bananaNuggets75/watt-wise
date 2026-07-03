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
  /** Which account/location this bill belongs to, e.g. "Cafe Marie". */
  accountName: string;
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
  file: BillFileMeta | null;
  createdAt: string;
}
