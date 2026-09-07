/**
 * Express application assembly.
 *
 * Kept separate from index.ts, which starts the server, so tests can drive
 * the app in-process without binding a port — and so several test files can
 * run without fighting over one.
 */

import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { MulterError } from "multer";
import { billsRouter } from "./routes/bills.js";
import { recommendationsRouter } from "./routes/recommendations.js";
import { appliancesRouter } from "./routes/appliances.js";
import { establishmentsRouter } from "./routes/establishments.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Health check - hit this to confirm the backend is up.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "wattwise-api", time: new Date().toISOString() });
  });

  // Utility bill upload / input module.
  app.use("/api/bills", billsRouter);

  // AI recommendation engine (v1).
  app.use("/api/recommendations", recommendationsRouter);

  // Appliance survey.
  app.use("/api/appliances", appliancesRouter);

  // Establishment survey (onboarding, straight after registration).
  app.use("/api/establishments", establishmentsRouter);

  /**
   * Central error handler. Must be registered after the routes. It translates
   * the two failure modes that the bill upload can hit into clean 400
   * responses instead of a generic 500:
   *   - multer LIMIT_FILE_SIZE   -> file over the 10 MB cap
   *   - our fileFilter rejection -> unsupported file type
   * Anything else falls through to a 500.
   */
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "FILE_TOO_LARGE", message: "Max file size is 10 MB." });
    }
    if (err instanceof Error && err.message === "UNSUPPORTED_FILE_TYPE") {
      return res
        .status(400)
        .json({ error: "UNSUPPORTED_FILE_TYPE", message: "Only JPG, PNG, or PDF files are allowed." });
    }
    console.error("[api] unhandled error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  });

  return app;
}
