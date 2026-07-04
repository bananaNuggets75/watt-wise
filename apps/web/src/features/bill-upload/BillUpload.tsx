/**
 * Bill upload / input screen (web).
 *
 * Mirrors the "Scan Your Bill" mockup: a file dropzone for an optional
 * scan (JPG/PNG/PDF, 10 MB) plus a manual entry form for the numbers the
 * MVP actually relies on (no OCR yet). On submit it calls the API client,
 * which posts everything as multipart/form-data.
 */

import { useRef, useState } from "react";
import { ApiError, createBill, type BillFormData } from "../../lib/api";
import "./BillUpload.css";

// Client-side mirror of the server's file rules, so we can reject bad
// files before uploading and show a friendly message immediately.
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

/** Blank form state used on first render and after a successful save. */
const EMPTY_FORM: BillFormData = {
  accountName: "",
  provider: "",
  kwhUsed: "",
  amount: "",
  periodStart: "",
  periodEnd: "",
};

export function BillUpload() {
  const [form, setForm] = useState<BillFormData>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Update one field of the manual form as the user types. */
  function handleField(field: keyof BillFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  /** Validate a chosen file against the same rules the server enforces. */
  function handleFile(selected: File | null) {
    setFileError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(selected.type)) {
      setFileError("Only JPG, PNG, or PDF files are allowed.");
      return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      setFileError("Max file size is 10 MB.");
      return;
    }
    setFile(selected);
  }

  /** Submit the form to the API and reflect success/failure in the UI. */
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrors([]);
    setSavedMessage(null);
    try {
      const bill = await createBill(form, file);
      setSavedMessage(`Saved ${bill.accountName} — ${bill.kwhUsed} kWh.`);
      setForm(EMPTY_FORM);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      // ApiError carries the backend's per-field validation details.
      if (err instanceof ApiError) {
        setErrors(err.details?.length ? err.details : [err.message]);
      } else {
        setErrors(["Something went wrong. Is the API running on :4000?"]);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bill-upload">
      <h1 className="bill-upload__title">Scan Your Bill</h1>
      <p className="bill-upload__subtitle">
        Upload a photo or PDF of your electricity bill, then confirm the numbers below.
      </p>

      {/* File dropzone — optional scan for record-keeping. */}
      <button
        type="button"
        className="dropzone"
        onClick={() => fileInputRef.current?.click()}
      >
        {/* Upload icon (inline SVG, not emoji, per project convention). */}
        <svg className="dropzone__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M11 16V7.85l-2.6 2.6L7 9l5-5 5 5-1.4 1.45-2.6-2.6V16h-2Zm-6 4a2 2 0 0 1-2-2v-3h2v3h14v-3h2v3a2 2 0 0 1-2 2H5Z"
          />
        </svg>
        <span className="dropzone__label">{file ? file.name : "Upload from File"}</span>
        <span className="dropzone__hint">JPG, PNG, or PDF · max 10 MB</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        className="visually-hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      {fileError && <p className="bill-upload__error">{fileError}</p>}

      {/* Manual entry — the numbers the MVP relies on. */}
      <form className="bill-form" onSubmit={handleSubmit}>
        <label className="bill-form__field">
          <span>Account name</span>
          <input
            value={form.accountName}
            onChange={(e) => handleField("accountName", e.target.value)}
            placeholder="Cafe Marie"
            required
          />
        </label>
        <label className="bill-form__field">
          <span>Provider</span>
          <input
            value={form.provider}
            onChange={(e) => handleField("provider", e.target.value)}
            placeholder="Meralco"
            required
          />
        </label>
        <div className="bill-form__row">
          <label className="bill-form__field">
            <span>Energy used (kWh)</span>
            <input
              type="number"
              min="0"
              step="any"
              value={form.kwhUsed}
              onChange={(e) => handleField("kwhUsed", e.target.value)}
              placeholder="312"
              required
            />
          </label>
          <label className="bill-form__field">
            <span>Amount</span>
            <input
              type="number"
              min="0"
              step="any"
              value={form.amount}
              onChange={(e) => handleField("amount", e.target.value)}
              placeholder="1785.50"
              required
            />
          </label>
        </div>
        <div className="bill-form__row">
          <label className="bill-form__field">
            <span>Period start</span>
            <input
              type="date"
              value={form.periodStart}
              onChange={(e) => handleField("periodStart", e.target.value)}
              required
            />
          </label>
          <label className="bill-form__field">
            <span>Period end</span>
            <input
              type="date"
              value={form.periodEnd}
              onChange={(e) => handleField("periodEnd", e.target.value)}
              required
            />
          </label>
        </div>

        {/* Validation / server errors. */}
        {errors.length > 0 && (
          <ul className="bill-upload__error-list">
            {errors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        )}
        {savedMessage && <p className="bill-upload__success">{savedMessage}</p>}

        <button type="submit" className="bill-form__submit" disabled={submitting}>
          {submitting ? "Saving…" : "Add bill"}
        </button>
      </form>
    </div>
  );
}
