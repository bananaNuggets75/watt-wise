/**
 * Vision-model OCR via OpenRouter.
 *
 * Sends the bill image to a multimodal LLM that reads the layout directly.
 * The model is asked for JSON, which `parseVisionReply` turns into an
 * OcrResult. That parsing is a pure function, kept separate from the network
 * call so it can be tested against real model replies — including the
 * malformed ones, which is where the bugs live.
 *
 * WARNING: the default model is a FREE OpenRouter endpoint, and free
 * endpoints LOG all inputs/outputs for provider training. A utility bill
 * contains personal data (account number, name, address), so this is for
 * DEV / DEMO with your own bill only — do NOT point real user data at a free
 * endpoint. For production, use a paid, no-logging model here.
 */

import type { OcrResult } from "../types/ocr.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Models to try, in order. OpenRouter moves to the next one when a model is
 * delisted, rate-limited, or down, so scanning survives any single one going
 * away — which it does: the previous default
 * (nvidia/nemotron-nano-12b-v2-vl:free) was removed from the catalogue and
 * every scan started failing with "No endpoints found". Free tiers are
 * throttled independently too, so a second name is a real fallback, not
 * ceremony.
 *
 * OCR_MODEL overrides the first entry; the rest still act as backups. All
 * free, so the list costs nothing.
 */
const DEFAULT_MODELS = [
  // Named models only, each verified reading a bill correctly. OpenRouter's
  // "openrouter/free" router was tried here and rejected: it optimises for
  // available capacity, not suitability, and routed a bill image to a
  // content-safety classifier that replied "User Safety: safe" — a success
  // as far as the API is concerned, and indistinguishable downstream from a
  // bill nobody could read.
  "dots-studio/dots-3-note-preview:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "google/gemma-4-31b-it:free",
];

/** OpenRouter rejects a `models` array longer than this with a 400. */
const MAX_MODELS = 3;

/** Instruction to the model. Kept strict so the reply is easy to parse. */
const PROMPT = `You are reading a Philippine electricity bill from an image.
Extract these fields and reply with ONLY a JSON object (no markdown, no prose):
{"accountName": string|null, "provider": string|null, "kwhUsed": number|null, "amount": number|null, "periodStart": string|null, "periodEnd": string|null}
- accountName: the account holder / customer name printed on the bill (e.g. "Buskowitz, Henry").
- provider: the electric utility company name (e.g. "Meralco").
- kwhUsed: total electricity consumed in kWh for this bill, as a number (no units).
- amount: total amount due, as a number (no currency symbol, no thousands separators).
- periodStart: billing period start date, formatted strictly as YYYY-MM-DD (e.g. "23 Dec 2022" -> "2022-12-23").
- periodEnd: billing period end date, formatted strictly as YYYY-MM-DD.
Use null for any field you cannot read.`;

/** Accept a value only if it's a strict ISO date (YYYY-MM-DD); else undefined.
 *  Keeps malformed dates out of the form's <input type="date">. */
function toIsoDate(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
    ? value.trim()
    : undefined;
}

/** Coerce a model value ("1,490.07", 1490.07, null) into a number or undefined. */
function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Pull the first JSON object out of the model's reply. Models sometimes wrap
 * JSON in ```code fences``` or add stray text, so we extract the {...} span
 * rather than JSON.parse-ing the whole string.
 */
function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Turn a model reply into an OcrResult. Pure and total: any field the model
 * omitted, nulled, or returned in an unusable form comes back undefined, so
 * a partial or malformed reply degrades to "the user types that one in"
 * rather than throwing.
 */
export function parseVisionReply(rawText: string): OcrResult {
  const parsed = extractJson(rawText) ?? {};
  return {
    accountName: typeof parsed.accountName === "string" ? parsed.accountName : undefined,
    provider: typeof parsed.provider === "string" ? parsed.provider : undefined,
    kwhUsed: toNumber(parsed.kwhUsed),
    amount: toNumber(parsed.amount),
    periodStart: toIsoDate(parsed.periodStart),
    periodEnd: toIsoDate(parsed.periodEnd),
    rawText,
  };
}

/**
 * OCR a bill image with the OpenRouter vision model. Requires
 * OPENROUTER_API_KEY. Throws on auth/network/API errors so the caller can
 * surface a clear failure (the web UI then falls back to manual entry).
 */
export async function scanBillWithVision(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<OcrResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  // A configured model leads; the defaults fill the remaining slots. Trimmed
  // to MAX_MODELS because a longer list is rejected outright, which would
  // fail every scan rather than just losing a fallback.
  const configured = process.env.OCR_MODEL;
  const models = (
    configured
      ? [configured, ...DEFAULT_MODELS.filter((m) => m !== configured)]
      : DEFAULT_MODELS
  ).slice(0, MAX_MODELS);

  // Encode the image as a data URL so it rides inside the JSON request.
  const dataUrl = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "WattWise",
    },
    body: JSON.stringify({
      // An array rather than a single `model`: OpenRouter walks it in order
      // and only errors once every entry has failed.
      models,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    // Log the upstream reason: the caller only ever sees "could not read the
    // image", so without this a delisted model, a rate limit and an outage
    // are indistinguishable from the outside — which is exactly what made
    // the last breakage take a live API call to identify.
    const detail = await res.text().catch(() => "");
    console.error(
      `[ocr] OpenRouter rejected the request (HTTP ${res.status}) for models ` +
        `${models.join(", ")}: ${detail.slice(0, 300)}`,
    );
    throw new Error(`OpenRouter OCR failed (${res.status})`);
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
    error?: { code?: number | string; message?: string };
  };

  // OpenRouter reports some failures with HTTP 200 and an error object, which
  // would otherwise read as "the model found nothing" rather than a fault.
  if (payload.error) {
    console.error(
      `[ocr] OpenRouter returned an error for models ${models.join(", ")}: ` +
        `${payload.error.code} ${payload.error.message}`,
    );
    throw new Error(`OpenRouter OCR failed: ${payload.error.message ?? "unknown error"}`);
  }

  const rawText = payload.choices?.[0]?.message?.content ?? "";
  return parseVisionReply(rawText);
}
