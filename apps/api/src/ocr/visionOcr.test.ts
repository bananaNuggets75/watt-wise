/**
 * Unit tests for parsing a vision model's reply.
 *
 * The model is asked for strict JSON but is not obliged to comply: replies
 * come back fenced in markdown, with prose around them, with nulls, with
 * numbers as strings, or truncated. Every one of those has to degrade to
 * "the user fills that field in", never to a crash or a wrong value.
 *
 * The samples here are shaped after real replies observed while testing
 * against actual Meralco and ILECO bills.
 */

import { describe, expect, it } from "vitest";
import { parseVisionReply } from "./visionOcr.js";

describe("a well-formed reply", () => {
  const raw = JSON.stringify({
    accountName: "Buskowitz, Henry",
    provider: "Meralco",
    kwhUsed: 136,
    amount: 1490.07,
    periodStart: "2022-12-23",
    periodEnd: "2023-01-22",
  });

  it("extracts every field", () => {
    expect(parseVisionReply(raw)).toMatchObject({
      accountName: "Buskowitz, Henry",
      provider: "Meralco",
      kwhUsed: 136,
      amount: 1490.07,
      periodStart: "2022-12-23",
      periodEnd: "2023-01-22",
    });
  });

  it("keeps the raw reply for debugging a bad read", () => {
    expect(parseVisionReply(raw).rawText).toBe(raw);
  });
});

describe("replies that are not clean JSON", () => {
  it("reads JSON wrapped in a markdown code fence", () => {
    // Observed: the model fenced its reply on some requests but not others.
    const raw = '```json\n{"provider": "Meralco", "kwhUsed": 136}\n```';
    expect(parseVisionReply(raw)).toMatchObject({ provider: "Meralco", kwhUsed: 136 });
  });

  it("reads JSON surrounded by prose", () => {
    const raw = 'Here is the data:\n{"kwhUsed": 246, "amount": 3229.21}\nHope that helps!';
    expect(parseVisionReply(raw)).toMatchObject({ kwhUsed: 246, amount: 3229.21 });
  });

  it("returns no fields when the reply contains no JSON", () => {
    const result = parseVisionReply("I cannot read this image.");
    expect(result.kwhUsed).toBeUndefined();
    expect(result.amount).toBeUndefined();
    expect(result.provider).toBeUndefined();
  });

  it("returns no fields when the JSON is truncated", () => {
    const result = parseVisionReply('{"kwhUsed": 136, "amount":');
    expect(result.kwhUsed).toBeUndefined();
  });

  it("survives an empty reply", () => {
    expect(() => parseVisionReply("")).not.toThrow();
    expect(parseVisionReply("").rawText).toBe("");
  });
});

describe("number coercion", () => {
  it("accepts numbers sent as strings", () => {
    expect(parseVisionReply('{"kwhUsed": "136"}').kwhUsed).toBe(136);
  });

  it("strips thousands separators", () => {
    // The model often echoes the bill's formatting: "1,490.07".
    expect(parseVisionReply('{"amount": "1,490.07"}').amount).toBe(1490.07);
  });

  it("ignores nulls", () => {
    expect(parseVisionReply('{"kwhUsed": null, "amount": null}').kwhUsed).toBeUndefined();
  });

  it("ignores values that are not numbers at all", () => {
    expect(parseVisionReply('{"kwhUsed": "not a number"}').kwhUsed).toBeUndefined();
  });

  it("ignores non-finite values", () => {
    // JSON has no Infinity, but a string can coerce to it.
    expect(parseVisionReply('{"amount": "Infinity"}').amount).toBeUndefined();
  });
});

describe("date handling", () => {
  it("accepts a strict ISO date", () => {
    expect(parseVisionReply('{"periodStart": "2022-12-23"}').periodStart).toBe("2022-12-23");
  });

  it("trims surrounding whitespace", () => {
    expect(parseVisionReply('{"periodStart": " 2022-12-23 "}').periodStart).toBe("2022-12-23");
  });

  it("rejects a date the model failed to normalise", () => {
    // The form's <input type="date"> only accepts YYYY-MM-DD, so anything
    // else must be dropped rather than passed through and silently ignored.
    expect(parseVisionReply('{"periodStart": "23 Dec 2022"}').periodStart).toBeUndefined();
    expect(parseVisionReply('{"periodStart": "12/23/2022"}').periodStart).toBeUndefined();
  });

  it("rejects a non-string date", () => {
    expect(parseVisionReply('{"periodEnd": 20221223}').periodEnd).toBeUndefined();
  });
});

describe("text fields", () => {
  it("ignores a non-string provider", () => {
    expect(parseVisionReply('{"provider": 123}').provider).toBeUndefined();
  });

  it("keeps the provider exactly as printed on the bill", () => {
    // Casing is normalised later, against the providers table.
    expect(parseVisionReply('{"provider": "MERALCO"}').provider).toBe("MERALCO");
  });
});

describe("partial reads", () => {
  it("keeps the fields it found and drops the rest", () => {
    // The ILECO bill photo was cropped: numbers legible, header cut off.
    const raw = '{"accountName": null, "provider": null, "kwhUsed": 246, "amount": 3229.21}';
    const result = parseVisionReply(raw);

    expect(result.kwhUsed).toBe(246);
    expect(result.amount).toBe(3229.21);
    expect(result.accountName).toBeUndefined();
    expect(result.provider).toBeUndefined();
  });
});
