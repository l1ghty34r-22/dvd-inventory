import { useEffect, useRef, useState } from "react";

import type { User } from "../api";
import { Link } from "../router";

interface Props {
  user: User;
  /** Show a link to the dashboard (when you are somewhere else, like the home page). */
  showDashboardLink: boolean;
  onLogout: () => void;
}

/** The round button top right: opens a small panel with who is logged in and Log out. */
export function AccountMenu({ user, showDashboardLink, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on a click anywhere else, or on Escape (which also puts focus back on the button).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="account" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        className="account-button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="account-panel"
        aria-label="Account"
      >
        <span className="account-avatar" aria-hidden="true">
          {user.email.charAt(0).toUpperCase()}
        </span>
        <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true">
          <path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>

      {open && (
        <div id="account-panel" className="account-panel">
          <p className="account-who">
            <span className="muted">Logged in as</span>
            <strong>{user.email}</strong>
          </p>
          {showDashboardLink && (
            <Link to="/dashboard/collection" className="account-item" onClick={() => setOpen(false)}>
              Dashboard
            </Link>
          )}
          <Link to="/settings" className="account-item" onClick={() => setOpen(false)}>
            Settings
          </Link>
          <button
            type="button"
            className="account-item"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
