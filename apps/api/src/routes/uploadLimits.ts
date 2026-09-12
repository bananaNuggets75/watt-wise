/**
 * Shared upload limits.
 *
 * The cap is stated in the web UI's hint text, and enforced by two separate
 * multer configs (storing a bill, scanning one). Keeping one definition
 * means the promise and the enforcement can't drift apart.
 */

/** 10 MB, matching the hint shown on the upload dropzone. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
