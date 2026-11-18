import { useState } from "react";
import type { FormEvent } from "react";

import { ApiError } from "../api";
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
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setUnknownEmail(null);
    setBusy(true);
    try {
      // On success the app sees the user and moves on to the dashboard.
      await login(email, password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setUnknownEmail(email.trim());
      else setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
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
            {busy ? "Logging in…" : "Log in"}
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
