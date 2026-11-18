from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import pytest

from app import mailer
from app.config import settings
from app.models import PasswordReset
from app.routers import password_reset

PASSWORD = "s3cret-pass"  # what register_and_login uses


@pytest.fixture
def outbox(monkeypatch):
    """Capture emails instead of sending them."""
    sent: list[dict] = []
    monkeypatch.setattr(
        mailer,
        "send_email",
        lambda to, subject, text, html=None: sent.append(
            {"to": to, "subject": subject, "text": text, "html": html}
        ),
    )
    monkeypatch.setattr(settings, "app_url", "https://neverdisc.example")
    return sent


def token_from(email: dict) -> str:
    link = next(word for word in email["text"].split() if word.startswith("https://"))
    assert link.startswith("https://neverdisc.example/reset-password?token=")
    return parse_qs(urlparse(link).query)["token"][0]


def ask(client, email):
    return client.post("/api/auth/forgot-password", json={"email": email})


def test_reset_password_end_to_end(client, auth_headers, outbox):
    response = ask(client, "URos@example.com")
    assert response.status_code == 200
    assert "If an account exists" in response.json()["message"]
    assert len(outbox) == 1 and outbox[0]["to"] == "uros@example.com"
    token = token_from(outbox[0])

    done = client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "fresh-pass-99"}
    )
    assert done.status_code == 200
    # New password works, old one doesn't, and existing sessions were signed out.
    assert (
        client.post(
            "/api/auth/login", data={"username": "uros@example.com", "password": "fresh-pass-99"}
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/auth/login", data={"username": "uros@example.com", "password": PASSWORD}
        ).status_code
        == 401
    )
    assert client.get("/api/auth/me", headers=auth_headers).status_code == 401

    # The link works only once.
    again = client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "another-pass"}
    )
    assert again.status_code == 400


def test_unknown_email_gets_the_same_answer_and_no_email(client, outbox):
    response = ask(client, "nobody@example.com")
    assert response.status_code == 200
    assert "If an account exists" in response.json()["message"]
    assert outbox == []


def test_one_email_per_minute(client, auth_headers, outbox):
    ask(client, "uros@example.com")
    ask(client, "uros@example.com")
    assert len(outbox) == 1


def test_expired_link(client, auth_headers, outbox, monkeypatch):
    ask(client, "uros@example.com")
    token = token_from(outbox[0])
    later = datetime.now(UTC) + password_reset.LINK_LIFETIME + timedelta(minutes=1)

    class Later(datetime):
        @classmethod
        def now(cls, tz=None):
            return later

    monkeypatch.setattr(password_reset, "datetime", Later)
    response = client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "fresh-pass-99"}
    )
    assert response.status_code == 400
    assert "expired" in response.json()["detail"]


def test_new_link_cancels_older_ones_once_used(client, auth_headers, outbox, monkeypatch):
    ask(client, "uros@example.com")
    first = token_from(outbox[0])
    monkeypatch.setattr(password_reset, "RESEND_AFTER", timedelta(0))
    ask(client, "uros@example.com")
    second = token_from(outbox[1])
    assert (
        client.post(
            "/api/auth/reset-password", json={"token": second, "new_password": "fresh-pass-99"}
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/auth/reset-password", json={"token": first, "new_password": "other-pass-99"}
        ).status_code
        == 400
    )


def test_bad_token_and_short_password(client):
    assert (
        client.post(
            "/api/auth/reset-password", json={"token": "x" * 40, "new_password": "fresh-pass-99"}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/auth/reset-password", json={"token": "x" * 40, "new_password": "short"}
        ).status_code
        == 422
    )


def test_tokens_are_stored_hashed(client, auth_headers, outbox):
    from sqlalchemy import select

    from app.database import get_db
    from app.main import app

    ask(client, "uros@example.com")
    token = token_from(outbox[0])
    db = next(app.dependency_overrides[get_db]())
    stored = db.scalars(select(PasswordReset.token_hash)).all()
    assert token not in stored and len(stored) == 1


def test_production_needs_mail_and_app_url(client, monkeypatch):
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "smtp_host", "")
    assert ask(client, "uros@example.com").status_code == 503
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "app_url", "")
    assert ask(client, "uros@example.com").status_code == 503


def test_link_uses_app_url_not_the_request(client, auth_headers, outbox):
    client.post(
        "/api/auth/forgot-password",
        json={"email": "uros@example.com"},
        headers={"Origin": "https://evil.example"},
    )
    assert "evil.example" not in outbox[0]["text"]
