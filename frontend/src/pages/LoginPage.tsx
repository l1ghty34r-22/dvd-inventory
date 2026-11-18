import { useState } from "react";
import type { FormEvent } from "react";

import { ApiError, TWO_FACTOR_REQUIRED } from "../api";
import { useAuth } from "../auth";
import { Link } from "../router";

/** Log in: a small, plain card. Creating an account has its own page (SignupPage). */
export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Set when the email has no account, so we can point to sign-up instead of a plain error.
  const [unknownEmail, setUnknownEmail] = useState<string | null>(null);
  // Once the password is right for an account with two-factor on, ask for the code.
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setUnknownEmail(null);
    setBusy(true);
    try {
      // On success the app sees the user and moves on to the dashboard.
      await login(email, password, needsCode ? code.trim() : undefined);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setUnknownEmail(email.trim());
      else if (err instanceof ApiError && err.message === TWO_FACTOR_REQUIRED) setNeedsCode(true);
      else if (err instanceof ApiError && err.message === "Incorrect two-factor code") {
        setError("That code didn't work. Use the newest one from your app, or a recovery code.");
      } else setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="auth-card login-card">
        <h1>Welcome back</h1>
        <p className="muted">Log in to see your shelf.</p>

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
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <Link
            to={
              email.trim()
                ? `/forgot-password?email=${encodeURIComponent(email.trim())}`
                : "/forgot-password"
            }
            className="text-button forgot-link"
          >
            Forgot password?
          </Link>
          {needsCode && (
            <label>
              Code from your authenticator app
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6-digit code, or a recovery code"
                autoFocus
                required
              />
            </label>
          )}
          {needsCode && !error && (
            <p className="muted hint">Two-factor authentication is on for this account.</p>
          )}
          {error && <p className="error">{error}</p>}
          {unknownEmail && (
            <div className="auth-notice" role="alert">
              <p>
                <strong>No account found for {unknownEmail}.</strong> Check the spelling, or
                register to start your shelf.
              </p>
              <Link
                to={`/signup?email=${encodeURIComponent(unknownEmail)}`}
                className="button secondary"
              >
                Create an account
              </Link>
            </div>
          )}
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Logging in…" : needsCode ? "Verify and log in" : "Log in"}
          </button>
        </form>

        <p className="auth-switch">
          New to NeverDisc? <Link to="/signup">Create an account</Link>
        </p>
      </div>
      <Link to="/" className="text-button back-link">
        ← Back to the home page
      </Link>
    </main>
  );
}
