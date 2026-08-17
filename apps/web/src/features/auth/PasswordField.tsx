/**
 * A password input with a show/hide toggle.
 *
 * Shared by login and register (which uses two), so the toggle behaves the
 * same everywhere and the icon markup lives in one place.
 *
 * Each field keeps its own visibility state: on the register form, revealing
 * the password should not also reveal the confirmation, since comparing them
 * by eye is the point of having two.
 */

import { useId, useState } from "react";
import "./Auth.css";

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Lets the browser tell a new password from an existing one. */
  autoComplete: "new-password" | "current-password";
  placeholder?: string;
  minLength?: number;
  required?: boolean;
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
  required = true,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();

  return (
    <div className="auth__field">
      <label htmlFor={inputId}>{label}</label>

      <div className="auth__password">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
        />

        {/* type="button" matters: inside a form, a bare button submits it. */}
        <button
          type="button"
          className="auth__reveal"
          onClick={() => setVisible((shown) => !shown)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          // Skip it in tab order: it's a convenience, and stopping between
          // every password field and the next one is worse than the help.
          tabIndex={-1}
        >
          {visible ? (
            // Eye with a stroke through it — currently visible, click to hide.
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 6.5a5 5 0 0 1 5 5c0 .51-.1 1-.24 1.46l3.06 3.06A11.8 11.8 0 0 0 23 11.5c-1.73-4.39-6-7.5-11-7.5-1.27 0-2.49.2-3.64.57l2.17 2.17c.47-.14.96-.24 1.47-.24zM2.71 3.16a1 1 0 0 0 0 1.41l1.97 1.97A11.85 11.85 0 0 0 1 11.5C2.73 15.89 7 19 12 19c1.52 0 2.97-.3 4.31-.82l2.72 2.72a1 1 0 0 0 1.41-1.41L4.13 3.16a1 1 0 0 0-1.42 0zM12 16.5a5 5 0 0 1-5-5c0-.77.18-1.5.49-2.14l1.57 1.57c-.03.18-.06.37-.06.57a3 3 0 0 0 3 3c.2 0 .38-.03.57-.07l1.57 1.57c-.65.32-1.37.5-2.14.5z"
              />
            </svg>
          ) : (
            // Plain eye — currently hidden, click to reveal.
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
