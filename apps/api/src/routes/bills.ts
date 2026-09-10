/**
 * Routes for storing an establishment's bills.
 *
 *   POST /api/establishments/:establishmentId/bills      Record a bill.
 *   GET  /api/establishments/:establishmentId/bills      List them.
 *   GET  /api/establishments/:establishmentId/bills/:id  Fetch one.
 *
 * Mounted as a sub-router of the establishments router, so authentication,
 * the database guard and the ownership check have all run before anything
 * here does. `mergeParams` is what makes :establishmentId visible.
 *
 * Scanning lives in billScan.ts — it stores nothing, so it needs no
 * establishment.
 *
 * The request is multipart/form-data: the file arrives as "file" and the
 * numbers arrive as ordinary text fields alongside it. multer parses both.
 */

import { Router } from "express";
import multer from "multer";
import { createBill, getBill, listBills } from "../store/billStore.js";
import { isUuid } from "../lib/uuid.js";
import { respondToStoreError, type StoreErrorMessages } from "./storeErrors.js";
import { MAX_FILE_BYTES } from "./uploadLimits.js";
import type { BillFileMeta, BillInput } from "../types/bill.js";

export const billsRouter = Router({ mergeParams: true });

/** How a database failure reads to someone filing a bill. */
const ERRORS: StoreErrorMessages = {
  source: "bills",
  staleReference: "that establishment or electric utility no longer exists",
  notPermitted: "You can't save a bill for another account's establishment.",
};

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "application/pdf"]);

/**
 * multer config: keep the file in memory (only its metadata is stored — the
 * bytes are never persisted), enforce the size cap, and reject any type that
 * isn't JPG / PNG / PDF before it is fully buffered.
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
 * Validate and normalise the form fields into a BillInput. Returns either
 * the parsed input or a list of human-readable problems, so the caller can
 * respond with 400 and tell the user exactly what to fix.
 *
 * There is no accountName or provider name here any more: both describe the
 * establishment, which the path already names.
 */
function parseBillInput(body: Record<string, unknown>): {
  input?: BillInput;
  errors: string[];
} {
  const errors: string[] = [];

  const periodStart = String(body.periodStart ?? "").trim();
  const periodEnd = String(body.periodEnd ?? "").trim();
  const customerAccountNumber = String(body.customerAccountNumber ?? "").trim();
  const providerId = String(body.providerId ?? "").trim();

  // Numbers come across as strings in multipart form data — coerce them.
  const kwhUsed = Number(body.kwhUsed);
  const amount = Number(body.amount);

  if (!periodStart) errors.push("periodStart is required");
  if (!periodEnd) errors.push("periodEnd is required");
  if (!Number.isFinite(kwhUsed) || kwhUsed < 0) {
    errors.push("kwhUsed must be a non-negative number");
  }
  if (!Number.isFinite(amount) || amount < 0) {
    errors.push("amount must be a non-negative number");
  }
  // The bills_period_order constraint would reject this too, but as a check
  // violation it would read as a server fault. Catching it here also lets
  // the message say which end is wrong.
  if (periodStart && periodEnd && periodEnd < periodStart) {
    errors.push("periodEnd must not be before periodStart");
  }
  // Optional, but if given it has to be a real selection rather than the
  // provider's name typed out.
  if (providerId && !isUuid(providerId)) {
    errors.push("provider is not a valid selection");
  }

  if (errors.length > 0) return { errors };

  return {
    input: {
      providerId: providerId || undefined,
      customerAccountNumber: customerAccountNumber || undefined,
      kwhUsed,
      amount,
      periodStart,
      periodEnd,
    },
    errors: [],
  };
}

/**
 * POST — record a bill against this establishment.
 * `upload.single("file")` runs first: it parses the optional file and the
 * text fields. Any multer error (too big, wrong type) is forwarded to the
 * error handler in app.ts.
 */
billsRouter.post("/", upload.single("file"), async (req, res, next) => {
  const { input, errors } = parseBillInput(req.body);
  if (!input) {
    return res.status(400).json({ error: "VALIDATION_FAILED", details: errors });
  }

  // If a file was attached, keep only its metadata.
  const fileMeta: BillFileMeta | null = req.file
    ? {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      }
    : null;

  const establishment = req.establishment!;

  try {
    const bill = await createBill(
      req.accessToken!,
      establishment.id,
      {
        ...input,
        // Statements almost always come from the establishment's own
        // utility, so that is the default; the form only sends a provider
        // when the bill names a different one.
        providerId: input.providerId ?? establishment.providerId,
      },
      fileMeta,
    );
    return res.status(201).json(bill);
  } catch (err) {
    return respondToStoreError(err, res, next, ERRORS);
  }
});

/** GET — this establishment's bills, most recent period first. */
billsRouter.get("/", async (req, res, next) => {
  try {
    res.json(await listBills(req.accessToken!, req.establishment!.id));
  } catch (err) {
    respondToStoreError(err, res, next, ERRORS);
  }
});

/** GET /:id — one bill of this establishment's, or 404. */
billsRouter.get("/:id", async (req, res, next) => {
  // A malformed id would make Postgres raise rather than return no rows.
  if (!isUuid(req.params.id)) {
    return res.status(404).json({ error: "BILL_NOT_FOUND" });
  }

  try {
    const bill = await getBill(req.accessToken!, req.establishment!.id, req.params.id);
    if (!bill) return res.status(404).json({ error: "BILL_NOT_FOUND" });
    return res.json(bill);
  } catch (err) {
    return respondToStoreError(err, res, next, ERRORS);
  }
});
