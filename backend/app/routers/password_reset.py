"""Forgot password: email a one-time link, then set a new password with it."""

import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status
from sqlalchemy import select, update

from app import mailer
from app.config import settings
from app.deps import DbSession
from app.models import PasswordReset, User
from app.schemas import ForgotPassword, ResetPassword
from app.security import hash_password

router = APIRouter(prefix="/api/auth", tags=["auth"])
log = logging.getLogger("neverdisc.reset")

LINK_LIFETIME = timedelta(hours=1)
# At most one email per account this often, so the button can't be used to flood an inbox.
RESEND_AFTER = timedelta(minutes=1)
SENT_MESSAGE = (
    "If an account exists for that email, we've sent a link to reset the password. "
    "It works for 1 hour."
)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _aware(moment: datetime) -> datetime:
    # SQLite gives back naive datetimes; treat them as UTC like we stored them.
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


def _site_url(request: Request) -> str:
    """Where the link in the email points. In production only the configured APP_URL is used:
    taking it from the request would let someone make the email link to their own site."""
    if settings.app_url:
        return settings.app_url.rstrip("/")
    if settings.app_env == "production":
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Password reset isn't set up yet (APP_URL is empty)",
        )
    return (request.headers.get("origin") or str(request.base_url)).rstrip("/")


def _send_reset_email(to: str, link: str) -> None:
    text = (
        "Someone (hopefully you) asked to reset the password for your NeverDisc account.\n\n"
        f"Choose a new password here (the link works once, for 1 hour):\n{link}\n\n"
        "If it wasn't you, ignore this email: your password stays the same."
    )
    html = f"""<p>Someone (hopefully you) asked to reset the password for your NeverDisc
account.</p>
<p><a href="{link}" style="display:inline-block;padding:10px 18px;background:#4338ca;color:#fff;
border-radius:8px;text-decoration:none;font-weight:600">Choose a new password</a></p>
<p style="color:#5d6070">The link works once, for 1 hour. If it wasn't you, ignore this email:
your password stays the same.</p>"""
    try:
        mailer.send_email(to, "Reset your NeverDisc password", text, html)
    except Exception:  # noqa: BLE001 - never let a mail failure surface to the requester
        log.exception("Could not send the password reset email")


@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPassword, request: Request, db: DbSession, background: BackgroundTasks
) -> dict[str, str]:
    """Always answers the same way, whether or not the email has an account."""
    if settings.app_env == "production" and not mailer.is_configured():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Password reset emails aren't set up yet"
        )
    site = _site_url(request)
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None:
        return {"message": SENT_MESSAGE}

    latest = db.scalar(
        select(PasswordReset.created_at)
        .where(PasswordReset.user_id == user.id)
        .order_by(PasswordReset.created_at.desc())
        .limit(1)
    )
    now = datetime.now(UTC)
    if latest is not None and now - _aware(latest) < RESEND_AFTER:
        return {"message": SENT_MESSAGE}

    token = secrets.token_urlsafe(32)
    db.add(
        PasswordReset(
            user_id=user.id, token_hash=_hash(token), created_at=now, expires_at=now + LINK_LIFETIME
        )
    )
    db.commit()
    # Sent after the response, so how long it takes can't hint whether the account exists.
    background.add_task(_send_reset_email, user.email, f"{site}/reset-password?token={token}")
    return {"message": SENT_MESSAGE}


@router.post("/reset-password")
def reset_password(payload: ResetPassword, db: DbSession) -> dict[str, str]:
    reset = db.scalar(select(PasswordReset).where(PasswordReset.token_hash == _hash(payload.token)))
    now = datetime.now(UTC)
    if reset is None or reset.used_at is not None or _aware(reset.expires_at) < now:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This reset link has expired or was already used. Ask for a new one.",
        )
    user = db.get(User, reset.user_id)
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This reset link is no longer valid.")

    user.password_hash = hash_password(payload.new_password)
    # Sign out every device that was logged in.
    user.token_version = (user.token_version or 0) + 1
    # This link, and any other unused ones for the account, stop working.
    db.execute(
        update(PasswordReset)
        .where(PasswordReset.user_id == user.id, PasswordReset.used_at.is_(None))
        .values(used_at=now)
    )
    db.commit()
    return {"message": "Your password has been changed. Log in with the new one."}
