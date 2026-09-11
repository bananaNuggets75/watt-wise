/**
 * Turning a scan result into the message shown under the dropzone.
 *
 * Kept out of the component deliberately. This list used to be built inside
 * a setState updater, which React defers — so the code that read it ran
 * first and always saw it empty, reporting "couldn't read the numbers" over
 * a form that had just been filled in correctly. (StrictMode also runs
 * updaters twice, which duplicated every entry.)
 *
 * As a pure function of the scan, neither failure is expressible.
 */

import type { ScanResult } from "../../lib/api";

/** The human names of the fields a scan actually recognised, in form order. */
export function fieldsFoundIn(scan: ScanResult): string[] {
  const found: string[] = [];
  if (scan.accountName) found.push("account name");
  if (scan.provider) found.push("provider");
  if (scan.kwhUsed !== undefined) found.push("kWh");
  if (scan.amount !== undefined) found.push("amount");
  // Start and end are filled together and reported as one thing, so the
  // message doesn't read "period, period".
  if (scan.periodStart || scan.periodEnd) found.push("period");
  return found;
}

/** The note to show after a scan. */
export function scanNoteFor(scan: ScanResult): string {
  const found = fieldsFoundIn(scan);
  return found.length > 0
    ? `Auto-filled ${found.join(", ")} from the scan — please double-check.`
    : "Couldn't read the numbers from that image — enter them manually below.";
}

/** The form fields a scan supplies, omitting anything it couldn't read so a
 *  partial scan never blanks out something the user already typed. */
export function formPatchFrom(scan: ScanResult): Record<string, string> {
  const patch: Record<string, string> = {};
  if (scan.accountName) patch.accountName = scan.accountName;
  if (scan.provider) patch.provider = scan.provider;
  if (scan.kwhUsed !== undefined) patch.kwhUsed = String(scan.kwhUsed);
  if (scan.amount !== undefined) patch.amount = String(scan.amount);
  if (scan.periodStart) patch.periodStart = scan.periodStart;
  if (scan.periodEnd) patch.periodEnd = scan.periodEnd;
  return patch;
}
