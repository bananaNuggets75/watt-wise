# WattWise

Turborepo monorepo for the WattWise web, mobile, and backend apps.

## Structure

```
wattwise/
├── apps/
│   ├── web/      React + Vite + TypeScript (web frontend)
│   ├── mobile/   Flutter (iOS / Android / web — mobile frontend)
│   └── api/      Node.js + Express + TypeScript (backend)
└── packages/     shared code (added later)
```

Backend plan (next phase): **Supabase** for the database and the **OpenAI SDK**
— deps are already listed in `apps/api/package.json`, wiring comes later.

## Prerequisites

- Node.js >= 20 and pnpm (`npm i -g pnpm`)
- Flutter SDK on your PATH (`flutter --version`)

## Setup

```bash
pnpm install
```

## Running

From the repo root:

```bash
pnpm dev          # runs web + api together via turbo
pnpm dev:web      # web only      -> http://localhost:5173
pnpm dev:api      # backend only  -> http://localhost:4000/health
```

Mobile (run from its own folder — Flutter isn't a JS package):

```bash
cd apps/mobile
flutter run
```

> Turbo also exposes `pnpm dev:mobile`, which calls `flutter run` for you,
> but launching from `apps/mobile` gives you Flutter's interactive hot-reload.

## Features

### Utility bill upload / input module

Lets a user record an electricity bill by uploading a photo and/or entering
the numbers manually. Uploading an **image** runs OCR to pre-fill the form.

- **Web UI:** `apps/web/src/features/bill-upload/` — the "Scan Your Bill"
  screen (file dropzone + manual entry form). Selecting a JPG/PNG scans it
  and auto-fills provider/kWh/amount; the user verifies before saving.
- **API:** `apps/api/src/routes/bills.ts`
  - `POST /api/bills` — multipart form: optional file (JPG/PNG/PDF, max
    10 MB) plus fields `accountName`, `provider`, `kwhUsed`, `amount`,
    `periodStart`, `periodEnd`. Returns the stored bill or a 400 with a
    per-field error list.
  - `POST /api/bills/scan` — multipart form with a `file` (JPG/PNG only).
    OCRs the image and returns suggested `{ kwhUsed, amount, provider,
    rawText }` without saving. Returns 400 if no image is sent.
  - `GET /api/bills` — list all bills (newest first).
  - `GET /api/bills/:id` — fetch one bill.

**OCR** has two swappable engines (`apps/api/src/ocr/`), selected by
`OCR_PROVIDER` (defaults to `openrouter` when `OPENROUTER_API_KEY` is set,
else `tesseract`). Either way OCR only *pre-fills* the form — manual entry is
always the fallback, and PDFs are stored but not OCR'd (images only).

- **`openrouter`** (`visionOcr.ts`) — a vision LLM
  (`nvidia/nemotron-nano-12b-v2-vl:free` by default) reads the bill layout
  directly and returns the fields as JSON. Much more accurate on real bill
  photos. Requires `OPENROUTER_API_KEY`.
  **Caveat:** the default is a *free* endpoint that **logs inputs** for
  training — a bill has personal data, so this is **dev/demo only**. Use a
  paid, no-logging model (`OCR_MODEL`) for real user data.
- **`tesseract`** (`billOcr.ts`) — local, no key, no logging. Best-effort
  regex parsing (`parseBillText`, unit-tested). Weaker on messy photos, and
  downloads its English language data on first scan (slower first request).
  Good offline fallback.

Storage is in-memory for now (`apps/api/src/store/billStore.ts`); it resets
on restart and will be swapped for Supabase later.

Run both apps together and open the web app:

```bash
pnpm dev          # web (:5173) + api (:4000)
```

### AI recommendation engine (v1)

Turns an account's energy profile into an energy health score (0-100) and a
list of impact-ranked "Priority Actions". v1 is **rule-based** — no API key
or cost — but it sits behind a provider-agnostic interface so a hosted LLM
(Gemini / OpenAI) can replace it later without changing anything else.

- **Engine:** `apps/api/src/engine/`
  - `recommendationEngine.ts` — the `RecommendationEngine` interface (the seam).
  - `ruleBasedEngine.ts` — v1 implementation: scores a profile and applies
    five transparent rules (usage vs peers, evening-peak share, high baseline
    draw, non-inverter appliances, aging appliances).
  - `index.ts` — factory; the single place to swap in an LLM engine later
    (switch on `AI_PROVIDER`).
- **API:** `apps/api/src/routes/recommendations.ts`
  - `POST /api/recommendations` — JSON body is an `EnergyProfile`. Required:
    `accountName`, `kwhUsed`, `amount`. Optional: `peerAverageKwh`,
    `baselineKwh`, `eveningUsageSharePct`, `appliances[]`. Returns the score,
    peer benchmark, and recommendations (plus which `engine` produced them).

Example:

```bash
pnpm dev:api   # api on :4000
curl -X POST http://localhost:4000/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"accountName":"Cafe Marie","kwhUsed":312,"amount":1785.5,
       "peerAverageKwh":265,"baselineKwh":60,"eveningUsageSharePct":38,
       "appliances":[{"type":"Air Conditioner","count":2,"isInverter":false,"ageYears":9}]}'
```
