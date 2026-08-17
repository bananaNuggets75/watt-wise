/**
 * Server entry point. The app itself is assembled in app.ts; this file only
 * starts it listening.
 */

import "dotenv/config";
import { createApp } from "./app.js";
import { isAuthConfigured } from "./auth/verifyToken.js";

const PORT = process.env.PORT ?? 4000;

createApp().listen(PORT, () => {
  console.log(`WattWise API listening on http://localhost:${PORT}`);

  // Say this at startup rather than letting it surface as a puzzling 401 on
  // the first request. dotenv reads .env once, here — so a server started
  // before the file was filled in stays unconfigured until it restarts.
  if (!isAuthConfigured()) {
    console.warn(
      "[auth] SUPABASE_URL is not set — every authenticated request will be " +
        "rejected. Set it in apps/api/.env and restart this server.",
    );
  }
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn(
      "[ocr] OPENROUTER_API_KEY is not set — bill scanning is unavailable. " +
        "Manual entry still works.",
    );
  }
});
