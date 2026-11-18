import { useState } from "react";
import type { FormEvent } from "react";

import { api } from "../api";
import { Link } from "../router";

/** Ask for a password reset link by email. */
export function ForgotPasswordPage() {
  // Arriving from the log-in page brings the email along.
  const [email, setEmail] = useState(
    () => new URLSearchParams(window.location.search).get("email") ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSent((await api.forgotPassword(email.trim())).message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="auth-card login-card">
        <h1>Forgot your password?</h1>
        {sent ? (
          <>
            <div className="auth-notice sent-notice" role="status">
              <p>
                <strong>Check your email.</strong> {sent}
              </p>
              <p className="muted">Not there? Look in spam, or try again in a minute.</p>
            </div>
            <Link to="/login" className="button primary auth-wide-button">
              Back to log in
            </Link>
          </>
        ) : (
          <>
            <p className="muted">
              Enter the email you log in with and we&apos;ll send you a link to choose a new
              password.
            </p>
            <form onSubmit={handleSubmit}>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  required
                />
              </label>
              {error && <p className="error">{error}</p>}
              <button type="submit" className="button primary" disabled={busy}>
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </>
        )}
        <p className="auth-switch">
          Remembered it? <Link to="/login">Log in</Link>
        </p>
      </div>
    </main>
  );
}
