import { useState } from "react";
import type { FormEvent } from "react";

import { useAuth } from "../auth";
import { Link } from "../router";

/** Log in: a small, plain card. Creating an account has its own page (SignupPage). */
export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // On success the app sees the user and moves on to the dashboard.
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
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
