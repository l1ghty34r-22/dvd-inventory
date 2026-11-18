import { useState } from "react";
import type { FormEvent } from "react";

import { useAuth } from "../auth";
import { Link } from "../router";

const PERKS = [
  "Search films and TV shows, or scan the barcode on the case",
  "See every disc on a shelf, with the story and cast a click away",
  "Track DVD, Blu-ray and 4K copies, and where you keep them",
  "Stats on your genres, decades and formats",
];

/** Create an account: its own page, wider than log in, with what you get on the left. */
export function SignupPage() {
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== password;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    // The "don't match" hint under the second box already says what's wrong.
    if (password !== confirm) return;
    setBusy(true);
    try {
      // Creates the account and logs in; the app then moves on to the dashboard.
      await register(email, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Try again.";
      setError(
        message === "Email already registered"
          ? "There's already an account with that email. Log in instead?"
          : message,
      );
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="signup-card">
        <section className="signup-pitch" aria-label="What you get">
          <h2>Start your shelf</h2>
          <p>A free NeverDisc account keeps your whole disc collection in one place.</p>
          <ul>
            {PERKS.map((perk) => (
              <li key={perk}>{perk}</li>
            ))}
          </ul>
        </section>

        <div className="signup-form">
          <h1>Create your account</h1>
          <p className="muted">Free, and it takes a few seconds.</p>

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
              Choose a password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <p className="muted hint">At least 8 characters.</p>
            <label>
              Type it again
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                aria-invalid={mismatch}
              />
            </label>
            {mismatch && <p className="error hint">The passwords don't match yet.</p>}
            {error && <p className="error">{error}</p>}
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? "Creating your account…" : "Create my account"}
            </button>
          </form>

          <p className="auth-switch">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </div>
      </div>
      <Link to="/" className="text-button back-link">
        ← Back to the home page
      </Link>
    </main>
  );
}
