/**
 * Thin typed client for the WattWise backend (apps/api).
 *
 * All network calls to the Node API go through here so components never
 * hardcode URLs or duplicate fetch/error logic. The base URL is read from
 * VITE_API_URL at build time and falls back to the local dev server.
 */

// Vite exposes env vars prefixed with VITE_. In dev this defaults to the
// local Express server; set VITE_API_URL in a .env for other environments.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/** Shape of a bill as returned by the API (mirrors apps/api Bill type). */
export interface Bill {
  id: string;
  accountName: string;
  provider: string;
  kwhUsed: number;
  amount: number;
  periodStart: string;
  periodEnd: string;
  file: { originalName: string; mimeType: string; size: number } | null;
  createdAt: string;
}

/** The manual fields the upload form collects. */
export interface BillFormData {
  accountName: string;
  provider: string;
  kwhUsed: string; // kept as strings from the form inputs
  amount: string;
  periodStart: string;
  periodEnd: string;
}

/** Error thrown for non-2xx responses, carrying the API's error payload. */
export class ApiError extends Error {
  status: number;
  details?: string[];

  constructor(message: string, status: number, details?: string[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

/**
 * Create a bill. Sends multipart/form-data so the optional scanned file
 * rides along with the manual fields — exactly what the API's multer
 * middleware expects. `file` is optional (manual entry works on its own).
 */
export async function createBill(form: BillFormData, file: File | null): Promise<Bill> {
  const body = new FormData();
  // Append each manual field; FormData sends them as text parts.
  body.append("accountName", form.accountName);
  body.append("provider", form.provider);
  body.append("kwhUsed", form.kwhUsed);
  body.append("amount", form.amount);
  body.append("periodStart", form.periodStart);
  body.append("periodEnd", form.periodEnd);
  if (file) body.append("file", file);

  const res = await fetch(`${API_URL}/api/bills`, { method: "POST", body });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Surface the API's message + per-field details to the UI.
    throw new ApiError(
      data.message ?? data.error ?? "Failed to save bill",
      res.status,
      data.details,
    );
  }
  return data as Bill;
}

/** Fetch all stored bills, newest first. */
export async function listBills(): Promise<Bill[]> {
  const res = await fetch(`${API_URL}/api/bills`);
  if (!res.ok) throw new ApiError("Failed to load bills", res.status);
  return (await res.json()) as Bill[];
}

/** Best-effort fields the OCR scan suggests (any may be absent). */
export interface ScanResult {
  accountName?: string;
  kwhUsed?: number;
  amount?: number;
  provider?: string;
  rawText: string;
}

/**
 * OCR a bill image (JPG/PNG) and return suggested field values. This does
 * not save anything — the caller pre-fills the form with the result and the
 * user verifies before submitting. Only images are accepted (no PDF).
 */
export async function scanBill(file: File): Promise<ScanResult> {
  const body = new FormData();
  body.append("file", file);

  const res = await fetch(`${API_URL}/api/bills/scan`, { method: "POST", body });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(data.message ?? data.error ?? "Failed to scan image", res.status);
  }
  return data as ScanResult;
}
