/**
 * Tests for the scan summary.
 *
 * These exist because of a real bug: a bill was read correctly — name,
 * provider, kWh, amount and period all filled in — while the screen said
 * "Couldn't read the numbers from that image". The summary was being built
 * inside a setState updater, so the code that read it ran first and always
 * saw an empty list.
 */

import { describe, expect, it } from "vitest";
import { fieldsFoundIn, formPatchFrom, scanNoteFor } from "./scanSummary";
import type { ScanResult } from "../../lib/api";

/** A scan of the Capiz Electric bill that exposed the bug. */
const fullScan: ScanResult = {
  accountName: "VIPINOSA, JONATHAN",
  provider: "CAPIZ ELECTRIC COOPERATIVE, INC.",
  kwhUsed: 122,
  amount: 1633.26,
  periodStart: "2026-06-05",
  periodEnd: "2026-06-21",
  rawText: "{}",
};

describe("what a scan found", () => {
  it("lists every field of a complete read", () => {
    expect(fieldsFoundIn(fullScan)).toEqual([
      "account name",
      "provider",
      "kWh",
      "amount",
      "period",
    ]);
  });

  it("reports the period once, not twice", () => {
    // Start and end are one thing to a reader: "period, period" reads as a bug.
    expect(fieldsFoundIn(fullScan).filter((f) => f === "period")).toHaveLength(1);
  });

  it("lists nothing for an unreadable image", () => {
    expect(fieldsFoundIn({ rawText: "I cannot read this image." })).toEqual([]);
  });

  it("lists only what a partial scan recovered", () => {
    // The cropped ILECO photo: numbers legible, header cut off.
    expect(fieldsFoundIn({ kwhUsed: 246, amount: 3229.21, rawText: "{}" })).toEqual([
      "kWh",
      "amount",
    ]);
  });

  it("counts a zero reading as found", () => {
    // 0 kWh is a real answer, and falsy — it must not be dropped.
    expect(fieldsFoundIn({ kwhUsed: 0, rawText: "{}" })).toEqual(["kWh"]);
  });
});

describe("the note shown to the user", () => {
  it("confirms what was filled in when the scan worked", () => {
    // The bug: this said "couldn't read" over a correctly filled form.
    const note = scanNoteFor(fullScan);

    expect(note).toMatch(/^Auto-filled /);
    expect(note).toContain("kWh");
    expect(note).toContain("double-check");
  });

  it("asks for manual entry only when nothing was read", () => {
    expect(scanNoteFor({ rawText: "" })).toMatch(/Couldn't read the numbers/);
  });

  it("still confirms a partial scan rather than claiming failure", () => {
    expect(scanNoteFor({ amount: 1633.26, rawText: "{}" })).toMatch(/^Auto-filled amount/);
  });
});

describe("the patch applied to the form", () => {
  it("fills every field a full scan supplied", () => {
    expect(formPatchFrom(fullScan)).toEqual({
      accountName: "VIPINOSA, JONATHAN",
      provider: "CAPIZ ELECTRIC COOPERATIVE, INC.",
      kwhUsed: "122",
      amount: "1633.26",
      periodStart: "2026-06-05",
      periodEnd: "2026-06-21",
    });
  });

  it("omits what wasn't read, so typed values survive a partial scan", () => {
    // Spreading an undefined over a field the user already filled would
    // wipe it; the key has to be absent, not undefined.
    const patch = formPatchFrom({ kwhUsed: 246, rawText: "{}" });

    expect(patch).toEqual({ kwhUsed: "246" });
    expect("accountName" in patch).toBe(false);
  });

  it("converts numbers to the strings the inputs hold", () => {
    const patch = formPatchFrom({ kwhUsed: 122, amount: 1633.26, rawText: "{}" });
    expect(patch.kwhUsed).toBe("122");
    expect(patch.amount).toBe("1633.26");
  });

  it("keeps a zero reading", () => {
    expect(formPatchFrom({ kwhUsed: 0, rawText: "{}" }).kwhUsed).toBe("0");
  });
});
