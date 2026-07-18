/**
 * Vision-model OCR via OpenRouter.
 *
 * Sends the bill image to a multimodal LLM that reads the layout directly —
 * far more reliable than Tesseract on messy real-world bill photos. It asks
 * the model to return the fields as JSON, then parses that into an OcrResult
 * (the same shape Tesseract returns), so the /scan route and web UI don't
 * care which engine produced it.
 *
 * WARNING: the default model is a FREE OpenRouter endpoint, and free
 * endpoints LOG all inputs/outputs for provider training. A utility bill
 * contains personal data (account number, name, address), so this is for
 * DEV / DEMO with your own bill only — do NOT point real user data at a free
 * endpoint. For production, use a paid, no-logging model here.
 */

import type { OcrResult } from "./billOcr.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// OCR-specialised free vision model; override with OCR_MODEL if desired.
const DEFAULT_MODEL = "nvidia/nemotron-nano-12b-v2-vl:free";

/** Instruction to the model. Kept strict so the reply is easy to parse. */
const PROMPT = `You are reading a Philippine electricity bill from an image.
Extract these fields and reply with ONLY a JSON object (no markdown, no prose):
{"provider": string|null, "kwhUsed": number|null, "amount": number|null}
- provider: the electric utility company name (e.g. "Meralco").
- kwhUsed: total electricity consumed in kWh for this bill, as a number (no units).
- amount: total amount due, as a number (no currency symbol, no thousands separators).
Use null for any field you cannot read.`;

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
  const model = process.env.OCR_MODEL ?? DEFAULT_MODEL;

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
      model,
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
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenRouter OCR failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawText = payload.choices?.[0]?.message?.content ?? "";

  // Parse the model's JSON; leave fields undefined if it didn't comply.
  const parsed = extractJson(rawText) ?? {};
  return {
    provider: typeof parsed.provider === "string" ? parsed.provider : undefined,
    kwhUsed: toNumber(parsed.kwhUsed),
    amount: toNumber(parsed.amount),
    rawText,
  };
}
