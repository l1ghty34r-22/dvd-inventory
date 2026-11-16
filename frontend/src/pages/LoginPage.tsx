import { useState } from "react";
import type { FormEvent } from "react";

import { useAuth } from "../auth";
import { Link } from "../router";

type Mode = "login" | "register";

function initialMode(): Mode {
  return new URLSearchParams(window.location.search).get("mode") === "register"
    ? "register"
    : "login";
}

export function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
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
      await (mode === "login" ? login(email, password) : register(email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="auth-card">
        <h1>{mode === "login" ? "Log in" : "Create your account"}</h1>
        <p className="muted">
          {mode === "login"
            ? "Welcome back. Your shelf is where you left it."
            : "Free, and it takes a few seconds."}
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
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={8}
              required
            />
          </label>
          {mode === "register" && <p className="muted hint">At least 8 characters.</p>}
          {error && <p className="error">{error}</p>}
          <button type="submit" className="button primary" disabled={busy}>
            {mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          className="text-button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
        >
          {mode === "login" ? "New here? Create an account" : "Already have an account? Log in"}
        </button>
      </div>
      <Link to="/" className="text-button back-link">
        ← Back to the home page
      </Link>
    </main>
  );
}
