/**
 * Types for reading a utility bill from an uploaded image.
 *
 * Every field is optional: OCR is best-effort, and the upload form treats
 * whatever comes back as a suggestion the user confirms. Anything unread is
 * simply left for them to type.
 */

export interface OcrResult {
  /** Account holder / customer name printed on the bill, if found. */
  accountName?: string;
  /** Energy used in kWh, if a value could be confidently located. */
  kwhUsed?: number;
  /** Total amount billed, if found. */
  amount?: number;
  /** Provider name, if recognised. */
  provider?: string;
  /** Billing period start as an ISO date (YYYY-MM-DD), if found. */
  periodStart?: string;
  /** Billing period end as an ISO date (YYYY-MM-DD), if found. */
  periodEnd?: string;
  /** The model's raw reply — kept for debugging a bad read. */
  rawText: string;
}
