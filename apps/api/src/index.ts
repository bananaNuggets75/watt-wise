import "dotenv/config";
import express from "express";
import cors from "cors";
import { recommendationsRouter } from "./routes/recommendations.js";

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors());
app.use(express.json());

// Health check - hit this to confirm the backend is up.
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "wattwise-api", time: new Date().toISOString() });
});

// AI recommendation engine (v1).
app.use("/api/recommendations", recommendationsRouter);

app.listen(PORT, () => {
  console.log(`WattWise API listening on http://localhost:${PORT}`);
});
