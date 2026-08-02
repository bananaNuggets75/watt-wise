/**
 * Appliance survey screen (web).
 *
 * Mirrors the "What appliances do you use?" mockup: a list of appliance
 * cards, each with a type, a quantity stepper, an inverter/non-inverter
 * toggle and an age field, plus "Add Appliance" to grow the list. The whole
 * list submits in one request.
 *
 * This data feeds the recommendation engine — its non-inverter and aging
 * appliance rules had no input before this screen existed.
 */

import { useState } from "react";
import { ApiError, saveAppliances, type ApplianceDraft } from "../../lib/api";
import "./ApplianceSurvey.css";

/** Types offered in the dropdown. "Other" lets the user type their own. */
const APPLIANCE_TYPES = [
  "Air Conditioner",
  "Refrigerator",
  "Television",
  "Washing Machine",
  "Electric Fan",
  "Water Heater",
  "Lighting",
  "Other",
];

/** A blank card, matching the mockup's defaults (quantity starts at 1). */
function emptyDraft(): ApplianceDraft {
  return { type: APPLIANCE_TYPES[0], count: 1 };
}

export function ApplianceSurvey() {
  const [drafts, setDrafts] = useState<ApplianceDraft[]>([emptyDraft()]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  /** Update one field on one card, leaving the others untouched. */
  function updateDraft(index: number, patch: Partial<ApplianceDraft>) {
    setDrafts((prev) =>
      prev.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)),
    );
  }

  function addDraft() {
    setDrafts((prev) => [...prev, emptyDraft()]);
  }

  /** Remove a card. The form always keeps at least one. */
  function removeDraft(index: number) {
    setDrafts((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  /** Submit every card in one request and reflect the result. */
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrors([]);
    setSavedMessage(null);
    try {
      const saved = await saveAppliances(drafts);
      setSavedMessage(`Saved ${saved.length} appliance${saved.length === 1 ? "" : "s"}.`);
      setDrafts([emptyDraft()]);
    } catch (err) {
      // ApiError carries per-row details ("appliance 2: type is required").
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
    <div className="appliance-survey">
      <h1 className="appliance-survey__title">What appliances do you use?</h1>
      <p className="appliance-survey__subtitle">
        Select all that apply and provide the correct details.
      </p>

      <form onSubmit={handleSubmit}>
        {drafts.map((draft, index) => (
          <section className="appliance-card" key={index}>
            <div className="appliance-card__row">
              <label className="appliance-card__field appliance-card__field--grow">
                <span>Appliance</span>
                <select
                  value={draft.type}
                  onChange={(e) => updateDraft(index, { type: e.target.value })}
                >
                  {APPLIANCE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="appliance-card__field appliance-card__field--narrow">
                <span>Qty</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={draft.count}
                  onChange={(e) =>
                    updateDraft(index, { count: Number(e.target.value) })
                  }
                />
              </label>

              {/* Only offered when there's more than one card to remove. */}
              {drafts.length > 1 && (
                <button
                  type="button"
                  className="appliance-card__remove"
                  onClick={() => removeDraft(index)}
                  aria-label={`Remove appliance ${index + 1}`}
                >
                  {/* Trash icon (inline SVG, not emoji, per project convention). */}
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M7 21a2 2 0 0 1-2-2V6H4V4h5V3h6v1h5v2h-1v13a2 2 0 0 1-2 2H7Zm2-4h2V8H9v9Zm4 0h2V8h-2v9Z"
                    />
                  </svg>
                </button>
              )}
            </div>

            {/* Inverter models draw noticeably less power, so the engine
                weighs this — hence a prominent toggle rather than a checkbox. */}
            <div className="appliance-card__field">
              <span>Type</span>
              <div className="toggle-group">
                <button
                  type="button"
                  className={draft.isInverter === true ? "toggle toggle--on" : "toggle"}
                  onClick={() => updateDraft(index, { isInverter: true })}
                >
                  Inverter
                </button>
                <button
                  type="button"
                  className={draft.isInverter === false ? "toggle toggle--on" : "toggle"}
                  onClick={() => updateDraft(index, { isInverter: false })}
                >
                  Non-inverter
                </button>
              </div>
            </div>

            <label className="appliance-card__field appliance-card__field--narrow">
              <span>Age (years)</span>
              <input
                type="number"
                min="0"
                step="1"
                value={draft.ageYears ?? ""}
                placeholder="Optional"
                onChange={(e) =>
                  updateDraft(index, {
                    ageYears: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
              />
            </label>
          </section>
        ))}

        <button type="button" className="appliance-survey__add" onClick={addDraft}>
          + Add Appliance
        </button>

        {errors.length > 0 && (
          <ul className="appliance-survey__error-list">
            {errors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        )}
        {savedMessage && <p className="appliance-survey__success">{savedMessage}</p>}

        <button type="submit" className="appliance-survey__submit" disabled={submitting}>
          {submitting ? "Saving…" : "Next"}
        </button>
      </form>
    </div>
  );
}
