/**
 * Establishment setup — the first screen after registration.
 *
 * Nothing a user records can be stored until they have an establishment:
 * bills and appliances both hang off one, and its type_id and provider_id
 * are NOT NULL, which is exactly why the signup trigger creates only the
 * account row and leaves this to onboarding.
 *
 * The type and utility lists come from the database rather than being
 * hardcoded here, so a provider added later (or read off a bill by OCR)
 * shows up without a frontend change.
 */

import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import { ApiError } from "../../lib/api";
import {
  createEstablishment,
  listEstablishmentTypes,
  listProviders,
  providerLabel,
  type EstablishmentType,
  type Provider,
} from "../../lib/establishments";
import "./EstablishmentSetup.css";

export function EstablishmentSetup() {
  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState("");
  const [address, setAddress] = useState("");
  const [providerId, setProviderId] = useState("");

  const [types, setTypes] = useState<EstablishmentType[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  // Register passes along wherever the user was originally headed.
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  // Load both option lists once. They're independent reads, so they run
  // together rather than one after the other.
  useEffect(() => {
    let active = true;

    Promise.all([listEstablishmentTypes(), listProviders()])
      .then(([loadedTypes, loadedProviders]) => {
        if (!active) return;
        setTypes(loadedTypes);
        setProviders(loadedProviders);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setErrors([
          err instanceof ApiError
            ? err.message
            : "Couldn't load the options. Is the API running on :4000?",
        ]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // The selects start empty on purpose — a pre-selected first option would
    // let someone submit a guess without reading it.
    const missing: string[] = [];
    if (!name.trim()) missing.push("Give your establishment a name.");
    if (!typeId) missing.push("Choose what kind of establishment it is.");
    if (!providerId) missing.push("Choose your electric utility.");
    if (missing.length > 0) {
      setErrors(missing);
      return;
    }

    setSubmitting(true);
    setErrors([]);
    try {
      await createEstablishment({ name, typeId, providerId, address });
      navigate(from, { replace: true });
    } catch (err) {
      // ApiError carries the API's per-field validation messages.
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
    <div className="establishment-setup">
      <h1 className="establishment-setup__title">Tell us about your place</h1>
      <p className="establishment-setup__subtitle">
        These details let WattWise compare your usage against similar
        establishments and read your bills correctly.
      </p>

      <form className="establishment-setup__form" onSubmit={handleSubmit}>
        <label className="establishment-setup__field">
          <span>Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Home, Brew Corner Cafe"
            autoComplete="organization"
            required
          />
        </label>

        <label className="establishment-setup__field">
          <span>Type</span>
          <select
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            disabled={loading}
            required
          >
            <option value="">{loading ? "Loading…" : "Select a type"}</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>

        {/* Optional: it feeds benchmarking against nearby places, which
            falls back to a wider comparison when it's missing. */}
        <label className="establishment-setup__field">
          <span>
            Address <span className="establishment-setup__optional">(optional)</span>
          </span>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, city"
            autoComplete="street-address"
          />
        </label>

        <label className="establishment-setup__field">
          <span>Electric utility</span>
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            disabled={loading}
            required
          >
            <option value="">{loading ? "Loading…" : "Select your utility"}</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {providerLabel(provider)}
              </option>
            ))}
          </select>
          <small className="establishment-setup__hint">
            The company named on your electricity bill.
          </small>
        </label>

        {errors.length > 0 && (
          <ul className="establishment-setup__errors">
            {errors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        )}

        <button
          type="submit"
          className="establishment-setup__submit"
          disabled={submitting || loading}
        >
          {submitting ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
