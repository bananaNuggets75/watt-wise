/**
 * Appliance survey screen (web).
 *
 * Mirrors the "What appliances do you use?" mockup: a list of appliance
 * cards, each with a kind, a quantity, an optional subtype and an age, plus
 * "Add Appliance" to grow the list. The whole list submits in one request.
 *
 * The options are read from Supabase rather than hardcoded, so adding an
 * appliance kind is a row, not a deploy. Which subtypes appear depends on the
 * chosen kind — an aircon offers Inverter/Non-inverter, a TV offers
 * LED/LCD, OLED and CRT — and kinds flagged as having no variants show no
 * subtype selector at all.
 *
 * This data feeds the recommendation engine, whose non-inverter and aging
 * appliance rules had no input before this screen existed.
 */

import { useEffect, useState } from "react";
import { ApiError, saveAppliances, type ApplianceDraft } from "../../lib/api";
import {
  fetchApplianceOptions,
  subtypesForKind,
  toIsInverter,
  type ApplianceOptions,
} from "../../lib/lookups";
import "./ApplianceSurvey.css";

/** What one card holds while it's being filled in. */
interface CardDraft {
  kindId: string;
  subtypeId?: string;
  count: number;
  ageYears?: number;
}

/** A blank card, matching the mockup's default quantity of 1. */
function emptyCard(kindId = ""): CardDraft {
  return { kindId, count: 1 };
}

export function ApplianceSurvey() {
  const [options, setOptions] = useState<ApplianceOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cards, setCards] = useState<CardDraft[]>([emptyCard()]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // Load the option lists once. Supabase is an external system, which is
  // what an effect is for.
  useEffect(() => {
    let active = true;
    fetchApplianceOptions()
      .then((loaded) => {
        if (!active) return;
        setOptions(loaded);
        // Select the first kind so the form starts on a valid choice rather
        // than an empty dropdown.
        setCards([emptyCard(loaded.kinds[0]?.id ?? "")]);
      })
      .catch((err: unknown) => {
        if (active) {
          setLoadError(
            err instanceof Error ? err.message : "Could not load appliance options.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  /** Update one field on one card, leaving the others untouched. */
  function updateCard(index: number, patch: Partial<CardDraft>) {
    setCards((prev) => prev.map((card, i) => (i === index ? { ...card, ...patch } : card)));
  }

  /** Changing the kind clears the subtype, which belonged to the old kind. */
  function changeKind(index: number, kindId: string) {
    updateCard(index, { kindId, subtypeId: undefined });
  }

  function addCard() {
    setCards((prev) => [...prev, emptyCard(options?.kinds[0]?.id ?? "")]);
  }

  /** Remove a card. The form always keeps at least one. */
  function removeCard(index: number) {
    setCards((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  /** Submit every card in one request and reflect the result. */
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!options) return;

    setSubmitting(true);
    setErrors([]);
    setSavedMessage(null);
    try {
      // The API still describes an appliance by kind name and an inverter
      // flag, so translate here. Moving it onto the schema's kind and
      // subtype ids is a follow-up, once appliances are stored in Postgres
      // instead of the API's in-memory list.
      const drafts: ApplianceDraft[] = cards.map((card) => {
        const kind = options.kinds.find((k) => k.id === card.kindId);
        const subtype = options.subtypes.find((s) => s.id === card.subtypeId);
        return {
          type: kind?.applianceName ?? "",
          count: card.count,
          isInverter: toIsInverter(subtype?.subtypeName),
          ageYears: card.ageYears,
        };
      });

      const saved = await saveAppliances(drafts);
      setSavedMessage(`Saved ${saved.length} appliance${saved.length === 1 ? "" : "s"}.`);
      setCards([emptyCard(options.kinds[0]?.id ?? "")]);
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

  if (loadError) {
    return (
      <div className="appliance-survey">
        <h1 className="appliance-survey__title">What appliances do you use?</h1>
        <p className="appliance-survey__error-list">
          Couldn't load the appliance list: {loadError}
        </p>
      </div>
    );
  }

  if (!options) {
    return (
      <div className="appliance-survey">
        <h1 className="appliance-survey__title">What appliances do you use?</h1>
        <p className="appliance-survey__subtitle">Loading appliance options…</p>
      </div>
    );
  }

  return (
    <div className="appliance-survey">
      <h1 className="appliance-survey__title">What appliances do you use?</h1>
      <p className="appliance-survey__subtitle">
        Select all that apply and provide the correct details.
      </p>

      <form onSubmit={handleSubmit}>
        {cards.map((card, index) => {
          const kind = options.kinds.find((k) => k.id === card.kindId);
          const subtypes = subtypesForKind(options.subtypes, card.kindId);
          // A kind either declares variants or it doesn't; don't show an
          // empty selector for a ceiling fan.
          const showSubtypes = Boolean(kind?.hasSubtype) && subtypes.length > 0;

          return (
            <section className="appliance-card" key={index}>
              <div className="appliance-card__row">
                <label className="appliance-card__field appliance-card__field--grow">
                  <span>Appliance</span>
                  <select
                    value={card.kindId}
                    onChange={(e) => changeKind(index, e.target.value)}
                  >
                    {options.kinds.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.applianceName}
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
                    value={card.count}
                    onChange={(e) => updateCard(index, { count: Number(e.target.value) })}
                  />
                </label>

                {/* Only offered when there's more than one card to remove. */}
                {cards.length > 1 && (
                  <button
                    type="button"
                    className="appliance-card__remove"
                    onClick={() => removeCard(index)}
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

              {showSubtypes && (
                <div className="appliance-card__field">
                  <span>Type</span>
                  <div className="toggle-group">
                    {subtypes.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={card.subtypeId === s.id ? "toggle toggle--on" : "toggle"}
                        onClick={() => updateCard(index, { subtypeId: s.id })}
                        aria-pressed={card.subtypeId === s.id}
                      >
                        {s.subtypeName}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="appliance-card__field appliance-card__field--narrow">
                <span>Age (years)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={card.ageYears ?? ""}
                  placeholder="Optional"
                  onChange={(e) =>
                    updateCard(index, {
                      ageYears: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                />
              </label>
            </section>
          );
        })}

        <button type="button" className="appliance-survey__add" onClick={addCard}>
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
