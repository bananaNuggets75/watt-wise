/**
 * Bill-scanner factory — the single place that decides which OCR engine the
 * /scan route uses. Keeps the route provider-agnostic (same idea as the
 * recommendation engine factory).
 *
 * Selection (env var OCR_PROVIDER):
 *   "openrouter" -> vision LLM (accurate on real bills; free endpoint LOGS
 *                    data, so dev/demo only). Requires OPENROUTER_API_KEY.
 *   "tesseract"  -> local OCR, no key, no logging (weaker on messy photos).
 *
 * Default: "openrouter" when OPENROUTER_API_KEY is present, else "tesseract".
 */

import { scanBill as scanWithTesseract, type OcrResult } from "./billOcr.js";
import { scanBillWithVision } from "./visionOcr.js";

/** A scanner reads an image buffer and returns best-effort bill fields. */
export type BillScanner = (imageBuffer: Buffer, mimeType: string) => Promise<OcrResult>;

/** Resolve the configured provider, applying the default rule. */
function resolveProvider(): "openrouter" | "tesseract" {
  const configured = process.env.OCR_PROVIDER?.toLowerCase();
  if (configured === "openrouter" || configured === "tesseract") return configured;
  return process.env.OPENROUTER_API_KEY ? "openrouter" : "tesseract";
}

/** Return the active bill scanner. */
export function getBillScanner(): { name: string; scan: BillScanner } {
  if (resolveProvider() === "openrouter") {
    return { name: "openrouter-vision", scan: scanBillWithVision };
  }
  // Tesseract ignores the mimeType argument (it only receives images anyway).
  return { name: "tesseract", scan: (buf) => scanWithTesseract(buf) };
}
