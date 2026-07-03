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

Lets a user record an electricity bill by uploading an optional scan and
entering the numbers manually (no OCR yet — that's a later phase).

- **Web UI:** `apps/web/src/features/bill-upload/` — the "Scan Your Bill"
  screen (file dropzone + manual entry form).
- **API:** `apps/api/src/routes/bills.ts`
  - `POST /api/bills` — multipart form: optional file (JPG/PNG/PDF, max
    10 MB) plus fields `accountName`, `provider`, `kwhUsed`, `amount`,
    `periodStart`, `periodEnd`. Returns the stored bill or a 400 with a
    per-field error list.
  - `GET /api/bills` — list all bills (newest first).
  - `GET /api/bills/:id` — fetch one bill.

Storage is in-memory for now (`apps/api/src/store/billStore.ts`); it resets
on restart and will be swapped for Supabase later.

Run both apps together and open the web app:

```bash
pnpm dev          # web (:5173) + api (:4000)
```
