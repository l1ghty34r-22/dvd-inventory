"""Two-factor authentication with an authenticator app (TOTP, RFC 6238) plus recovery codes.

Works with Google Authenticator, Microsoft Authenticator, 1Password, Authy and the like:
6 digits, a new code every 30 seconds, SHA-1, which is what all of them expect.
"""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote, urlencode

import segno

ISSUER = "NeverDisc"
STEP_SECONDS = 30
DIGITS = 6
# Accept the code before and after the current one, for clocks a little out of sync.
WINDOW = 1
RECOVERY_CODE_COUNT = 8


def new_secret() -> str:
    """A random 160-bit secret, base32 encoded (the format authenticator apps read)."""
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _code_at(secret: str, step: int) -> str:
    padded = secret + "=" * (-len(secret) % 8)
    key = base64.b32decode(padded, casefold=True)
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(number % 10**DIGITS).zfill(DIGITS)


def current_step(now: float | None = None) -> int:
    return int((time.time() if now is None else now) // STEP_SECONDS)


def code_for(secret: str, now: float | None = None) -> str:
    """The code an authenticator app would show right now (used by tests)."""
    return _code_at(secret, current_step(now))


def matching_step(secret: str, code: str, now: float | None = None) -> int | None:
    """The time step `code` belongs to, if it is valid now; None if it is not."""
    code = code.replace(" ", "").strip()
    if not (code.isdigit() and len(code) == DIGITS):
        return None
    step = current_step(now)
    for candidate in range(step - WINDOW, step + WINDOW + 1):
        if hmac.compare_digest(_code_at(secret, candidate), code):
            return candidate
    return None


def otpauth_uri(secret: str, email: str) -> str:
    label = quote(f"{ISSUER}:{email}")
    query = urlencode(
        {"secret": secret, "issuer": ISSUER, "digits": DIGITS, "period": STEP_SECONDS}
    )
    return f"otpauth://totp/{label}?{query}"


def qr_svg_data_uri(uri: str) -> str:
    return segno.make(uri, error="m").svg_data_uri(scale=5, border=2)


def new_recovery_codes() -> list[str]:
    """One-time codes like "7f3a-9c21", for when the phone with the app is lost."""
    return [f"{secrets.token_hex(2)}-{secrets.token_hex(2)}" for _ in range(RECOVERY_CODE_COUNT)]


def hash_recovery_code(code: str) -> str:
    # The codes are random and single-use, so a plain SHA-256 is enough to avoid storing them.
    return hashlib.sha256(code.strip().lower().encode("utf-8")).hexdigest()
