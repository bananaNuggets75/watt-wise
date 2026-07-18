/**
 * Bill OCR service.
 *
 * Uses Tesseract.js (local, no API key) to read text off an uploaded bill
 * image, then applies best-effort regex parsing to pull out the two most
 * useful numbers: energy used (kWh) and total amount. OCR on real-world
 * photos is imperfect, so results are treated as *suggestions* — the web
 * form pre-fills them and the user verifies before saving.
 *
 * The parser (`parseBillText`) is a pure function, split out from the OCR
 * call so it can be unit-tested without running Tesseract.
 */

import Tesseract from "tesseract.js";

/** Best-effort fields extracted from a bill's text, plus the raw OCR text. */
export interface OcrResult {
  /** Energy used in kWh, if a value could be confidently located. */
  kwhUsed?: number;
  /** Total amount billed, if found. */
  amount?: number;
  /** Provider name, if a known one is recognised. */
  provider?: string;
  /** The full text Tesseract read — useful for debugging / manual review. */
  rawText: string;
}

/** Known providers we can recognise by name in the bill text. Extend as needed. */
const KNOWN_PROVIDERS = ["Meralco", "Veco", "Davao Light", "Cepalco", "Ileco"];

/**
 * Turn an OCR string like "1,234.56" into a number (1234.56).
 * Returns undefined if it isn't a sensible number.
 */
function toNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse raw OCR text into likely bill fields. Pure and deterministic so it
 * can be tested with sample text. Everything here is best-effort: if a
 * pattern doesn't match, the field is simply left undefined for the user
 * to fill in manually.
 */
export function parseBillText(text: string): Omit<OcrResult, "rawText"> {
  const result: Omit<OcrResult, "rawText"> = {};

  // --- kWh used ---------------------------------------------------------
  // Match a number immediately followed by "kWh" (e.g. "312 kWh"), or a
  // number that follows a "kWh used"/"total kwh" label.
  const kwhMatch =
    text.match(/([\d,]+(?:\.\d+)?)\s*kwh\b/i) ??
    text.match(/(?:total\s+)?kwh(?:\s+used)?[^\d]{0,12}([\d,]+(?:\.\d+)?)/i);
  result.kwhUsed = toNumber(kwhMatch?.[1]);

  // --- Total amount -----------------------------------------------------
  // Prefer an explicit "amount due"/"please pay" label; fall back to a
  // currency-marked value (₱ or PHP). Require 2 decimals to avoid grabbing
  // random integers.
  const amountMatch =
    text.match(
      /(?:total\s+amount\s+due|amount\s+due|please\s+pay|total\s+amount)[^\d]{0,12}([\d,]+\.\d{2})/i,
    ) ?? text.match(/(?:php|₱)\s*([\d,]+\.\d{2})/i);
  result.amount = toNumber(amountMatch?.[1]);

  // --- Provider ---------------------------------------------------------
  const provider = KNOWN_PROVIDERS.find((p) =>
    new RegExp(`\\b${p}\\b`, "i").test(text),
  );
  if (provider) result.provider = provider;

  return result;
}

/**
 * Run OCR on an image buffer and return the parsed suggestions plus the raw
 * text. Tesseract downloads its English language data on first run and
 * caches it, so the first call is slower than later ones.
 */
export async function scanBill(imageBuffer: Buffer): Promise<OcrResult> {
  const {
    data: { text },
  } = await Tesseract.recognize(imageBuffer, "eng");
  return { ...parseBillText(text), rawText: text };
}
