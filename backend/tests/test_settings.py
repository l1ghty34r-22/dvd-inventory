import base64

import pytest
from sqlalchemy import create_engine, inspect, text

from app import two_factor
from app.database import upgrade_schema
from tests.conftest import register_and_login

PASSWORD = "s3cret-pass"  # what register_and_login uses


def login(client, email, password=PASSWORD, otp=None):
    data = {"username": email, "password": password}
    if otp is not None:
        data["otp"] = otp
    return client.post("/api/auth/login", data=data)


# --- authenticator codes -------------------------------------------------------------------


@pytest.mark.parametrize(
    ("unix_time", "expected"),
    # RFC 6238 test vectors (SHA-1), last 6 of the 8 digits.
    [(59, "287082"), (1111111109, "081804"), (1234567890, "005924"), (2000000000, "279037")],
)
def test_totp_matches_the_standard(unix_time, expected):
    secret = base64.b32encode(b"12345678901234567890").decode().rstrip("=")
    assert two_factor.code_for(secret, unix_time) == expected
    assert two_factor.matching_step(secret, expected, unix_time) is not None


def test_totp_accepts_neighbouring_codes_only():
    secret = two_factor.new_secret()
    now = 1_800_000_000
    assert two_factor.matching_step(secret, two_factor.code_for(secret, now - 30), now)
    assert two_factor.matching_step(secret, two_factor.code_for(secret, now + 30), now)
    assert two_factor.matching_step(secret, two_factor.code_for(secret, now - 120), now) is None
    assert two_factor.matching_step(secret, "12ab56", now) is None


# --- email and password --------------------------------------------------------------------


def test_me_reports_two_factor_off(client, auth_headers):
    assert client.get("/api/auth/me", headers=auth_headers).json()["two_factor_enabled"] is False


def test_change_email(client, auth_headers):
    response = client.post(
        "/api/auth/email",
        json={"new_email": "New@Example.com", "password": PASSWORD},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["email"] == "new@example.com"
    assert login(client, "new@example.com").status_code == 200
    assert login(client, "uros@example.com").status_code == 404


def test_change_email_checks_password_and_clashes(client, auth_headers):
    register_and_login(client, "taken@example.com")
    wrong = client.post(
        "/api/auth/email",
        json={"new_email": "x@example.com", "password": "wrong-pass"},
        headers=auth_headers,
    )
    assert wrong.status_code == 401
    clash = client.post(
        "/api/auth/email",
        json={"new_email": "taken@example.com", "password": PASSWORD},
        headers=auth_headers,
    )
    assert clash.status_code == 409


def test_change_password_signs_out_other_devices(client, auth_headers):
    second = {"Authorization": f"Bearer {login(client, 'uros@example.com').json()['access_token']}"}
    response = client.post(
        "/api/auth/password",
        json={"current_password": PASSWORD, "new_password": "brand-new-pass"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    fresh = {"Authorization": f"Bearer {response.json()['access_token']}"}

    assert client.get("/api/auth/me", headers=fresh).status_code == 200
    assert client.get("/api/auth/me", headers=auth_headers).status_code == 401
    assert client.get("/api/auth/me", headers=second).status_code == 401
    assert login(client, "uros@example.com").status_code == 401
    assert login(client, "uros@example.com", "brand-new-pass").status_code == 200


def test_change_password_rules(client, auth_headers):
    wrong = client.post(
        "/api/auth/password",
        json={"current_password": "nope-nope", "new_password": "brand-new-pass"},
        headers=auth_headers,
    )
    assert wrong.status_code == 401
    short = client.post(
        "/api/auth/password",
        json={"current_password": PASSWORD, "new_password": "short"},
        headers=auth_headers,
    )
    assert short.status_code == 422


# --- two-factor ----------------------------------------------------------------------------


def turn_on_2fa(client, headers):
    setup = client.post("/api/auth/2fa/setup", json={"password": PASSWORD}, headers=headers)
    assert setup.status_code == 200, setup.text
    body = setup.json()
    assert body["otpauth_uri"].startswith("otpauth://totp/NeverDisc")
    assert body["qr_svg"].startswith("data:image/svg+xml")
    secret = body["secret"]
    enabled = client.post(
        "/api/auth/2fa/enable", json={"code": two_factor.code_for(secret)}, headers=headers
    )
    assert enabled.status_code == 200, enabled.text
    return secret, enabled.json()["recovery_codes"]


def test_two_factor_login(client, auth_headers, monkeypatch):
    secret, recovery = turn_on_2fa(client, auth_headers)
    assert len(recovery) == 8
    assert client.get("/api/auth/me", headers=auth_headers).json()["two_factor_enabled"] is True

    # Password alone is no longer enough.
    response = login(client, "uros@example.com")
    assert response.status_code == 401
    assert response.json()["detail"] == "Two-factor code required"
    assert login(client, "uros@example.com", otp="000000").status_code == 401

    # A code from the next 30 seconds works once; the same code can't be used twice.
    later = two_factor.current_step() * 30 + 30
    monkeypatch.setattr(two_factor.time, "time", lambda: later)
    code = two_factor.code_for(secret)
    assert login(client, "uros@example.com", otp=code).status_code == 200
    assert login(client, "uros@example.com", otp=code).status_code == 401

    # A recovery code works once too.
    assert login(client, "uros@example.com", otp=recovery[0]).status_code == 200
    assert login(client, "uros@example.com", otp=recovery[0]).status_code == 401


def test_two_factor_setup_needs_password_and_a_right_code(client, auth_headers):
    assert (
        client.post(
            "/api/auth/2fa/setup", json={"password": "wrong"}, headers=auth_headers
        ).status_code
        == 401
    )
    client.post("/api/auth/2fa/setup", json={"password": PASSWORD}, headers=auth_headers)
    bad = client.post("/api/auth/2fa/enable", json={"code": "000000"}, headers=auth_headers)
    assert bad.status_code == 400
    # Not on until a right code is given.
    assert login(client, "uros@example.com").status_code == 200


def test_turn_off_two_factor(client, auth_headers, monkeypatch):
    secret, recovery = turn_on_2fa(client, auth_headers)
    later = two_factor.current_step() * 30 + 30
    monkeypatch.setattr(two_factor.time, "time", lambda: later)
    no_code = client.post(
        "/api/auth/2fa/disable", json={"password": PASSWORD, "code": "000000"}, headers=auth_headers
    )
    assert no_code.status_code == 400
    off = client.post(
        "/api/auth/2fa/disable",
        json={"password": PASSWORD, "code": two_factor.code_for(secret)},
        headers=auth_headers,
    )
    assert off.status_code == 200
    assert off.json()["two_factor_enabled"] is False
    assert login(client, "uros@example.com").status_code == 200


def test_upgrade_adds_user_columns(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR(255), "
                "password_hash VARCHAR(255), created_at DATETIME)"
            )
        )
        conn.execute(text("INSERT INTO users (id, email, password_hash) VALUES (1, 'a@b.c', 'x')"))
    upgrade_schema(engine)
    upgrade_schema(engine)
    columns = {c["name"] for c in inspect(engine).get_columns("users")}
    assert {
        "token_version",
        "totp_secret",
        "totp_enabled",
        "totp_last_step",
        "recovery_codes",
    } <= columns
    with engine.begin() as conn:
        row = conn.execute(text("SELECT token_version, totp_enabled FROM users")).one()
    assert (row[0], bool(row[1])) == (0, False)
