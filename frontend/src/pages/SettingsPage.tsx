import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { api } from "../api";
import type { TwoFactorSetup } from "../api";
import { useAuth } from "../auth";
import { Link } from "../router";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
}

function Section({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <div className="settings-section-head">
        <h2>{title}</h2>
        <p className="muted">{intro}</p>
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

function EmailSettings() {
  const { user, updateAccount } = useAuth();
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const updated = await api.changeEmail(newEmail.trim(), password);
      updateAccount(updated);
      setDone(`Your email is now ${updated.email}.`);
      setNewEmail("");
      setPassword("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Email" intro="The address you log in with.">
      <p>
        <span className="muted">Current email: </span>
        <strong>{user?.email}</strong>
      </p>
      <form className="settings-form" onSubmit={handleSubmit}>
        <label>
          New email
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Your password, to confirm it's you
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        {done && <p className="confirm">{done}</p>}
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? "Saving…" : "Change email"}
        </button>
      </form>
    </Section>
  );
}

function PasswordSettings() {
  const { user, updateAccount } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== next;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (next !== confirm) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const { access_token } = await api.changePassword(current, next);
      // Other devices are signed out; this one carries on with the new token.
      updateAccount(user, access_token);
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Password"
      intro="Changing it logs you out everywhere else, so only this device stays logged in."
    >
      <form className="settings-form" onSubmit={handleSubmit}>
        {/* Lets password managers tell which saved login this new password belongs to. */}
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={user?.email ?? ""}
          readOnly
          hidden
        />
        <label>
          Current password
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          New password
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            minLength={8}
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
        {mismatch && <p className="error hint">The new passwords don't match yet.</p>}
        {error && <p className="error">{error}</p>}
        {done && (
          <p className="confirm">Password changed. You've been logged out on your other devices.</p>
        )}
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? "Saving…" : "Change password"}
        </button>
      </form>
    </Section>
  );
}

/** "ABCD EFGH ..." is easier to type into an app than one long string. */
function grouped(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

function TwoFactorSettings() {
  const { user, updateAccount } = useAuth();
  const enabled = user?.two_factor_enabled ?? false;
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function startSetup(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      setSetup(await api.twoFactorSetup(password));
      setPassword("");
    });
  }

  function confirmSetup(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const { recovery_codes } = await api.twoFactorEnable(code.trim());
      setRecoveryCodes(recovery_codes);
      setSetup(null);
      setCode("");
      updateAccount(await api.me());
    });
  }

  function turnOff(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      updateAccount(await api.twoFactorDisable(password, code.trim()));
      setPassword("");
      setCode("");
    });
  }

  async function copyCodes() {
    if (!recoveryCodes) return;
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const status = (
    <p className="twofa-status">
      Two-factor authentication is{" "}
      <span className={enabled ? "status-pill on" : "status-pill off"}>{enabled ? "On" : "Off"}</span>
    </p>
  );

  let body: ReactNode;
  if (recoveryCodes) {
    // Shown once, straight after turning it on.
    body = (
      <div className="recovery">
        <p className="confirm">
          <strong>Two-factor authentication is on.</strong>
        </p>
        <p>
          Save these recovery codes somewhere safe. Each one works once, instead of a code from
          your app, if you lose your phone. You won't see them again.
        </p>
        <ul className="recovery-codes">
          {recoveryCodes.map((c) => (
            <li key={c}>
              <code>{c}</code>
            </li>
          ))}
        </ul>
        <div className="settings-actions">
          <button type="button" className="button secondary" onClick={() => void copyCodes()}>
            {copied ? "Copied" : "Copy codes"}
          </button>
          <button type="button" className="button primary" onClick={() => setRecoveryCodes(null)}>
            I've saved them
          </button>
        </div>
      </div>
    );
  } else if (enabled) {
    body = (
      <form className="settings-form" onSubmit={turnOff}>
        <p className="muted">
          To turn it off, enter your password and a code from your app (or a recovery code).
        </p>
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
        <label>
          Code
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="button danger" disabled={busy}>
          Turn off two-factor
        </button>
      </form>
    );
  } else if (setup) {
    body = (
      <form className="settings-form" onSubmit={confirmSetup}>
        <ol className="twofa-steps">
          <li>
            Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password,
            Authy…) and scan this code.
            <img className="twofa-qr" src={setup.qr_svg} alt="QR code for your authenticator app" />
            <span className="muted small-note">
              Can't scan it? Type this key into the app instead:{" "}
              <code className="twofa-secret">{grouped(setup.secret)}</code>
            </span>
          </li>
          <li>
            Enter the 6-digit code the app shows for NeverDisc.
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              aria-label="Code from your authenticator app"
              required
            />
          </li>
        </ol>
        {error && <p className="error">{error}</p>}
        <div className="settings-actions">
          <button type="submit" className="button primary" disabled={busy}>
            Turn on two-factor
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setSetup(null);
              setError(null);
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  } else {
    body = (
      <form className="settings-form" onSubmit={startSetup}>
        <p className="muted">
          Adds a second step to logging in: after your password, a 6-digit code from an app on your
          phone.
        </p>
        <label>
          Your password, to start
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
          Set up two-factor
        </button>
      </form>
    );
  }

  return (
    <Section
      title="Two-factor authentication"
      intro="Keeps your account safe even if someone learns your password."
    >
      {status}
      {body}
    </Section>
  );
}

export function SettingsPage() {
  return (
    <main className="settings">
      <Link to="/dashboard/collection" className="text-button back-link">
        ← Back to my collection
      </Link>
      <h1>Settings</h1>
      <EmailSettings />
      <PasswordSettings />
      <TwoFactorSettings />
    </main>
  );
}
