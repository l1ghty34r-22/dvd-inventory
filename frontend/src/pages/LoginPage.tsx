import { useState } from "react";
import type { FormEvent } from "react";

import { useAuth } from "../auth";

export function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await (mode === "login" ? login(email, password) : register(email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <h1>DVD Inventory</h1>
      <p className="muted">Every disc you own, on one shelf you can search from anywhere.</p>

      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
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
        <button type="submit" className="primary" disabled={busy}>
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
    </main>
  );
}
