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

**Supabase** provides authentication and the Postgres database (schema in
`supabase/migrations/`). Bills and appliances are still served from in-memory
stores in the API; moving them onto those tables is the next step.

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
without an `accountId` land on a placeholder account until the establishment
picker exists. Storage is still in-memory
(`apps/api/src/store/applianceStore.ts`) — moving it onto the `appliances`
table in `supabase/migrations/` is the next step, and will also replace the
`isInverter` boolean with the schema's per-kind subtypes.

### Authentication

Email + password sign-up and sign-in, backed by **Supabase Auth**.

- **Web UI:** `apps/web/src/features/auth/` — `/register` and `/login`.
  Basic fields only; the visual design is a separate pass.
- **Client:** `apps/web/src/lib/auth.ts` — every auth call goes through this
  one module (which is why swapping the earlier local implementation for
  Supabase didn't touch the pages). Supabase persists the session and
  refreshes the access token itself, so there is no token handling in app
  code; `lib/session.ts` just reads the current token out of the client.
- **API:** `apps/api/src/auth/verifyToken.ts` verifies the JWT against the
  project's published key set (JWKS), cached after the first fetch — so a
  request is checked locally rather than by calling Supabase each time.
  Verifying the *signature* is the point: without it, anyone could hand-write
  a token claiming to be any user.

The id in a verified token is the same uuid Postgres sees as `auth.uid()`, so
route scoping and the RLS policies agree on who owns a row.

**What's protected.** `requireAuth` (`apps/api/src/middleware/requireAuth.ts`)
guards every bill and appliance route, and handlers scope reads and writes to
`req.user`. `POST /api/recommendations` stays open — it scores data supplied
in the request and reads nothing from storage.

On the web, `RequireAuth` (`apps/web/src/features/auth/RequireAuth.tsx`)
wraps the protected pages, verifies the session rather than assuming a stored
token is valid, and remembers the attempted path so signing in returns the
user there.

Sign-up currently signs the user straight in. If email confirmation is turned
on in the Supabase dashboard, Supabase returns a user with **no session** —
that case is surfaced as "check your email" rather than navigating to a page
the user can't load yet.

## Database schema

The schema lives in **`supabase/migrations/`** as ordered migrations, so
changes are applied incrementally rather than by re-running one large file.

```
accounts (1) ──< establishments (1) ──< bills
                                  (1) ──< appliances
```

- **accounts** — one row per authenticated user, created automatically by a
  trigger on sign-up. `auth.users` belongs to Supabase and can't be extended,
  so this is the usual companion table.
- **establishments** — a place whose electricity is tracked (a household, a
  cafe, a branch). Every user has at least one; data hangs off the
  establishment, so someone with two cafes keeps their bills separate.
  Optional `latitude`/`longitude` support benchmarking against nearby
  establishments of the same type.
- **bills** / **appliances** — recorded per establishment.
- **Lookup tables** — `establishment_types`, `providers`, `appliance_kinds`
  and `appliance_subtypes`, seeded in their migration. Normalising these
  replaces free-text provider names and the old `is_inverter` boolean, so
  subtypes vary by kind (inverter for an aircon, OLED for a TV) and
  "MERALCO" and "Meralco" are one provider. Providers are the one list users
  can extend, since OCR regularly reads a cooperative that isn't seeded.

Two constraints worth knowing: appliances reference `(subtype_id, kind_id)`
as a composite key, which makes an Air Conditioner of subtype "OLED"
impossible to store; and `customer_account_number` (the "CAN" printed on a
bill) is recorded per bill but is **not a secret** — it appears on every
statement, so it must never be accepted as a credential.

**Row-Level Security is enabled on every table.** Postgres filters by owner,
so a missing `WHERE` clause in application code cannot leak another user's
data — which is also why the anon key is safe to ship to the browser.

### Applying migrations

```bash
# one-time: point the CLI at your project
npx supabase link --project-ref <your-project-ref>

npx supabase db push        # apply pending migrations
npx supabase migration new <name>   # start a new one
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
