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

### Appliance survey

Records what appliances an account uses. This is the input for the
recommendation engine's non-inverter and aging-appliance rules, which had no
data source before it.

- **Web UI:** `apps/web/src/features/appliance-survey/` at `/appliances` —
  appliance cards (type, quantity, inverter/non-inverter, optional age) with
  "Add Appliance"; the whole list submits at once.
- **API:** `apps/api/src/routes/appliances.ts`
  - `POST /api/appliances` — accepts one appliance or an array. Every entry is
    validated before any is saved, so a bad row rejects the batch instead of
    leaving a half-saved survey; errors name the row (`appliance 2: ...`).
  - `GET /api/appliances` — list all, or one account's with `?accountId=`.
  - `DELETE /api/appliances/:id` — remove an entry.

A stored appliance is the engine's `ApplianceInput` plus ids, so survey rows
can be passed to `POST /api/recommendations` unchanged. Entries submitted
without an `accountId` land on a placeholder account until auth and the
account picker exist. Storage is in-memory
(`apps/api/src/store/applianceStore.ts`); the `appliances` table is already in
`supabase/schema.sql`.

### Authentication

Email + password register and sign-in, so the app has a working login while
the Supabase project is still being set up.

- **Web UI:** `apps/web/src/features/auth/` — `/register` and `/login`.
  Basic fields only; the visual design is a separate pass.
- **Client:** `apps/web/src/lib/auth.ts` — every auth call goes through this
  one module, which is what makes the switch to Supabase Auth a single-file
  change. The token is kept in `localStorage` so a refresh doesn't sign the
  user out.
- **API:** `apps/api/src/routes/auth.ts`
  - `POST /api/auth/register` — create an account and sign in. 409 if the
    email is taken.
  - `POST /api/auth/login` — sign in. Returns a deliberately vague 401 so it
    can't be used to discover which emails are registered.
  - `POST /api/auth/logout` — invalidate the token.
  - `GET /api/auth/me` — resolve a bearer token back to its user.

Passwords are hashed with scrypt and a per-user salt, and compared in
constant time. Emails are stored lowercased, so sign-in is case-insensitive.

**What's protected.** `requireAuth` (`apps/api/src/middleware/requireAuth.ts`)
guards every bill and appliance route, and those rows carry a `userId`:
listings filter by it, and single-row reads and deletes match on it too, so
another user's id returns the same 404 as a missing row rather than
confirming it exists. `POST /api/recommendations` stays open — it scores data
supplied in the request and reads nothing from storage.

On the web, `RequireAuth` (`apps/web/src/features/auth/RequireAuth.tsx`)
wraps the protected pages. It verifies the token with the API rather than
trusting that one is present, so a token left over from a previous run
redirects to sign-in instead of stranding the user on a page whose every
request fails, and it remembers the attempted path so signing in returns them
there.

**This is a development stand-in, not production auth.** Users and sessions
are in-memory (`apps/api/src/store/userStore.ts`), so both reset when the API
restarts, and there is no email verification, password reset, or rate
limiting. Replacing it with Supabase Auth means rewriting that store and
`apps/web/src/lib/auth.ts`; the routes, pages, and `AuthUser`/session shapes
were built to match what Supabase returns. The bill/appliance data is already
schema-ready for it: accounts carry a placeholder `user_id` that becomes the
real one, and the RLS policies in `supabase/schema.sql` are written and
commented out.

## Database schema

`supabase/schema.sql` defines the Postgres/Supabase schema:

```
accounts (1) ──< bills
          (1) ──< appliances
```

An **account** is one electricity account/location (e.g. "Cafe Marie"). Bills
and appliances both hang off it — that account layer is what connects a
user's data together, which is why it exists before users do.

Bills are grouped by **`customer_account_number`** (the "CAN" printed on the
bill), so statements from different months land under the same account with
no login required. The CAN is *not* a secret — it appears on every bill — so
it groups data and must never be accepted as a credential.

**Auth is not set up yet**, so `accounts.user_id` carries a fixed placeholder
(`00000000-…-0000`) with no FK to `auth.users`. The "When auth arrives"
section at the bottom of the file is the entire migration: point `user_id` at
real users and enable the (already-written) row-level security policies.
Claiming an account is then just setting its `user_id` — its bills and
appliances come along unchanged.

Apply it to a database with:

```bash
psql -d <your-database> -f supabase/schema.sql
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
