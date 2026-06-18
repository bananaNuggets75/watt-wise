import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors());
app.use(express.json());

// Health check — hit this to confirm the backend is up.
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "wattwise-api", time: new Date().toISOString() });
});

// Example endpoint the web/mobile apps can call.
app.get("/api/hello", (_req, res) => {
  res.json({ message: "Hello from the WattWise API 👋" });
});

app.listen(PORT, () => {
  console.log(`⚡ WattWise API listening on http://localhost:${PORT}`);
});
