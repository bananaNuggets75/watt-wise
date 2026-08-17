/**
 * Bill scanning.
 *
 * A vision model reads the bill image directly. Tesseract was tried first
 * and removed: on real Philippine utility bills — dense, multi-column, small
 * type — it returned mangled text ("71,490.07", "manco"), and a scanner that
 * fills the form with plausible-looking wrong numbers is worse than one that
 * declines, since the user may not catch it.
 *
 * This module stays as the seam so a different model (notably a paid,
 * no-logging one) can be swapped in without touching the routes.
 */

import { scanBillWithVision } from "./visionOcr.js";
import type { OcrResult } from "../types/ocr.js";

/** A scanner reads an image buffer and returns best-effort bill fields. */
export type BillScanner = (imageBuffer: Buffer, mimeType: string) => Promise<OcrResult>;

/** Whether a scanner is usable — i.e. the vision provider is configured. */
export function isScanAvailable(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/** Return the active bill scanner. */
export function getBillScanner(): { name: string; scan: BillScanner } {
  return { name: "openrouter-vision", scan: scanBillWithVision };
}

export type { OcrResult };
