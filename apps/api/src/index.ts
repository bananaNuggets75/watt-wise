/**
 * Server entry point. The app itself is assembled in app.ts; this file only
 * starts it listening.
 */

import "dotenv/config";
import { createApp } from "./app.js";

const PORT = process.env.PORT ?? 4000;

createApp().listen(PORT, () => {
  console.log(`WattWise API listening on http://localhost:${PORT}`);
});
