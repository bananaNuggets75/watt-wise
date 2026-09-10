/**
 * Bill scanning — OCR only, no storage.
 *
 *   POST /api/bills/scan  Read an uploaded image and return suggested
 *                         fields for the upload form.
 *
 * This is deliberately not nested under an establishment, unlike the routes
 * that store bills: scanning saves nothing and reads nothing, so there is no
 * row for an establishment to own. Requiring one would mean the user had to
 * choose where a bill belongs before they could find out what it says.
 *
 * It still requires a signed-in user, because it spends money upstream.
 */

import { Router } from "express";
import multer from "multer";
import { getBillScanner, isScanAvailable } from "../ocr/index.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { MAX_FILE_BYTES } from "./uploadLimits.js";

export const billScanRouter = Router();

billScanRouter.use(requireAuth);

/**
 * Scanning is restricted to JPG / PNG, since the vision model is sent a
 * raster image — a PDF is accepted for storage but can't be read.
 */
const IMAGE_MIME = new Set(["image/jpeg", "image/png"]);
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("UNSUPPORTED_FILE_TYPE"));
    }
  },
});

/**
 * POST /api/bills/scan — OCR an uploaded image and return suggested fields.
 * Saves nothing: the user reviews the suggestions, corrects them, and then
 * submits the bill itself to the establishment's own route.
 */
billScanRouter.post("/scan", uploadImage.single("file"), async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ error: "NO_IMAGE", message: "Attach a JPG or PNG image to scan." });
  }
  // Say so plainly rather than degrading to a worse reader: manual entry
  // still works, so the user isn't blocked either way.
  if (!isScanAvailable()) {
    return res.status(503).json({
      error: "SCAN_UNAVAILABLE",
      message: "Bill scanning isn't configured. Enter the details manually.",
    });
  }
  // Obtained via the factory so the model can change without touching this.
  const scanner = getBillScanner();
  try {
    const result = await scanner.scan(req.file.buffer, req.file.mimetype);
    return res.json({ engine: scanner.name, ...result });
  } catch (err) {
    // A scan failure isn't fatal — the web UI falls back to manual entry.
    console.error(`[ocr] ${scanner.name} scan failed:`, err);
    return res
      .status(502)
      .json({ error: "SCAN_FAILED", message: "Could not read the image." });
  }
});
