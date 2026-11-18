import { useState } from "react";
import type { FormEvent } from "react";

import { api } from "../api";
import { useAuth } from "../auth";
import { Link } from "../router";

/** Opened from the link in the reset email: choose a new password. */
export function ResetPasswordPage() {
  const { user, logout } = useAuth();
  const [token] = useState(() => new URLSearchParams(window.location.search).get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mismatch = confirm.length > 0 && confirm !== password;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) return;
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(token, password);
      // The reset signed out every device, including this one if it was logged in.
      if (user) logout();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="auth-card login-card">
        <h1>Choose a new password</h1>
        {!token ? (
          <div className="auth-notice" role="alert">
            <p>This page needs the link from your reset email.</p>
            <Link to="/forgot-password" className="button secondary">
              Send me a new link
            </Link>
          </div>
        ) : done ? (
          <>
            <div className="auth-notice sent-notice" role="status">
              <p>
                <strong>Your password has been changed.</strong> You&apos;ve been logged out on
                every device; log in with the new password.
              </p>
            </div>
            <Link to="/login" className="button primary auth-wide-button">
              Log in
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <label>
              New password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                autoFocus
                required
              />
            </label>
            <p className="muted hint">At least 8 characters.</p>
            <label>
              New password again
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
            {mismatch && <p className="error hint">The passwords don&apos;t match yet.</p>}
            {error && (
              <div className="auth-notice" role="alert">
                <p>{error}</p>
                <Link to="/forgot-password" className="button secondary">
                  Send me a new link
                </Link>
              </div>
            )}
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? "Saving…" : "Save new password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
