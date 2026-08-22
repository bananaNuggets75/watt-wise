/**
 * Registration page.
 *
 * Basic fields only — the visual design is a separate pass, so this sticks
 * to the structure and behaviour: validate, submit, show errors, redirect.
 */

import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ApiError } from "../../lib/api";
import { register } from "../../lib/auth";
import { PasswordField } from "./PasswordField";
import "./Auth.css";

export function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  // RequireAuth stashes the page the user was trying to reach.
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // Confirmation is a client-side concern only — the API never sees it.
    if (password !== confirmPassword) {
      setErrors(["Passwords do not match."]);
      return;
    }

    setSubmitting(true);
    setErrors([]);
    try {
      await register(email, password);
      // A new account owns no establishment yet, and nothing can be recorded
      // without one — so onboarding comes first. It forwards to `from` once
      // the establishment exists.
      navigate("/establishment", { replace: true, state: { from } });
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
    <div className="auth">
      <h1 className="auth__title">Create your account</h1>
      <p className="auth__subtitle">Turn electricity bills into smarter decisions.</p>

      <form className="auth__form" onSubmit={handleSubmit}>
        <label className="auth__field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>

        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          minLength={8}
        />

        <PasswordField
          label="Confirm password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
        />

        {errors.length > 0 && (
          <ul className="auth__errors">
            {errors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        )}

        <button type="submit" className="auth__submit" disabled={submitting}>
          {submitting ? "Creating account…" : "Sign up"}
        </button>
      </form>

      <p className="auth__alt">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
