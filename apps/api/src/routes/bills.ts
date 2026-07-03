/**
 * Routes for the utility bill upload / input module.
 *
 *   POST /api/bills   Create a bill from manual form fields, with an
 *                     optional scanned file (JPG / PNG / PDF, max 10 MB).
 *   GET  /api/bills   List all stored bills (newest first).
 *   GET  /api/bills/:id  Fetch one bill by id.
 *
 * The request is multipart/form-data: the file arrives as "file" and the
 * numbers arrive as ordinary text fields alongside it. multer parses both.
 */

import { Router } from "express";
import multer from "multer";
import { createBill, getBill, listBills } from "../store/billStore.js";
import type { BillFileMeta, BillInput } from "../types/bill.js";

export const billsRouter = Router();

/** File-upload limits and allowed types for a bill scan. */
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB, matches the UI hint
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "application/pdf"]);

/**
 * multer config: keep the file in memory (we only read its metadata for
 * v1 — we don't persist bytes yet), enforce the size cap, and reject any
 * type that isn't JPG / PNG / PDF before it's fully buffered.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("UNSUPPORTED_FILE_TYPE"));
    }
  },
});

/**
 * Validate and normalise the manual form fields into a BillInput.
 * Returns either the parsed input or a list of human-readable errors, so
 * the caller can respond with 400 and tell the user exactly what to fix.
 */
function parseBillInput(body: Record<string, unknown>): {
  input?: BillInput;
  errors: string[];
} {
  const errors: string[] = [];

  // Trim the string fields; treat empty/whitespace as missing.
  const accountName = String(body.accountName ?? "").trim();
  const provider = String(body.provider ?? "").trim();
  const periodStart = String(body.periodStart ?? "").trim();
  const periodEnd = String(body.periodEnd ?? "").trim();

  // Numbers come across as strings in multipart form data — coerce them.
  const kwhUsed = Number(body.kwhUsed);
  const amount = Number(body.amount);

  if (!accountName) errors.push("accountName is required");
  if (!provider) errors.push("provider is required");
  if (!periodStart) errors.push("periodStart is required");
  if (!periodEnd) errors.push("periodEnd is required");
  if (!Number.isFinite(kwhUsed) || kwhUsed < 0)
    errors.push("kwhUsed must be a non-negative number");
  if (!Number.isFinite(amount) || amount < 0)
    errors.push("amount must be a non-negative number");

  if (errors.length > 0) return { errors };

  return {
    input: { accountName, provider, kwhUsed, amount, periodStart, periodEnd },
    errors: [],
  };
}

/**
 * POST /api/bills — create a bill.
 * `upload.single("file")` runs first: it parses the optional file and the
 * text fields. Any multer error (too big, wrong type) is forwarded to the
 * error handler below.
 */
billsRouter.post("/", upload.single("file"), (req, res) => {
  const { input, errors } = parseBillInput(req.body);
  if (!input) {
    return res.status(400).json({ error: "VALIDATION_FAILED", details: errors });
  }

  // If a file was attached, keep only its metadata for now.
  const fileMeta: BillFileMeta | null = req.file
    ? {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      }
    : null;

  const bill = createBill(input, fileMeta);
  return res.status(201).json(bill);
});

/** GET /api/bills — list every stored bill, newest first. */
billsRouter.get("/", (_req, res) => {
  res.json(listBills());
});

/** GET /api/bills/:id — fetch one bill or 404. */
billsRouter.get("/:id", (req, res) => {
  const bill = getBill(req.params.id);
  if (!bill) return res.status(404).json({ error: "BILL_NOT_FOUND" });
  return res.json(bill);
});
