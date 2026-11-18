from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from app import two_factor
from app.deps import CurrentUser, DbSession
from app.models import User
from app.schemas import (
    EmailChange,
    PasswordChange,
    PasswordConfirm,
    RecoveryCodes,
    Token,
    TwoFactorCode,
    TwoFactorDisable,
    TwoFactorSetup,
    UserCreate,
    UserOut,
)
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

# The log-in page looks for this exact message to show the code box.
TWO_FACTOR_REQUIRED = "Two-factor code required"


def _check_password(user: User, password: str) -> None:
    if not verify_password(password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")


def _use_second_factor(user: User, code: str) -> bool:
    """True if `code` is a valid authenticator code (not used before) or an unused recovery
    code. Records the use so neither can be replayed. The caller commits."""
    if user.totp_secret:
        step = two_factor.matching_step(user.totp_secret, code)
        if step is not None and (user.totp_last_step is None or step > user.totp_last_step):
            user.totp_last_step = step
            return True
    hashed = two_factor.hash_recovery_code(code)
    remaining = list(user.recovery_codes or [])
    if hashed in remaining:
        remaining.remove(hashed)
        user.recovery_codes = remaining
        return True
    return False


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: DbSession) -> User:
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(email=email, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    return user


@router.post("/login", response_model=Token)
def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DbSession,
    otp: Annotated[str | None, Form(description="Two-factor code, if turned on")] = None,
) -> Token:
    # The OAuth2 form calls the field "username"; we use the email there.
    user = db.scalar(select(User).where(User.email == form.username.lower()))
    if user is None:
        # Say so plainly so the page can point people to sign-up. Registering already reveals
        # whether an email is taken, so this gives nothing extra away.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found for that email",
        )
    if not verify_password(form.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.totp_enabled:
        if not otp:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, TWO_FACTOR_REQUIRED)
        if not _use_second_factor(user, otp):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect two-factor code")
        db.commit()
    return Token(access_token=create_access_token(user.id, user.token_version or 0))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user


@router.post("/email", response_model=UserOut)
def change_email(payload: EmailChange, user: CurrentUser, db: DbSession) -> User:
    _check_password(user, payload.password)
    new_email = payload.new_email.lower()
    if new_email != user.email:
        if db.scalar(select(User).where(User.email == new_email)) is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "That email is already used by another account"
            )
        user.email = new_email
        db.commit()
    return user


@router.post("/password", response_model=Token)
def change_password(payload: PasswordChange, user: CurrentUser, db: DbSession) -> Token:
    """Change the password and sign out every other device. Returns a fresh token for this one."""
    _check_password(user, payload.current_password)
    user.password_hash = hash_password(payload.new_password)
    user.token_version = (user.token_version or 0) + 1
    db.commit()
    return Token(access_token=create_access_token(user.id, user.token_version))


@router.post("/2fa/setup", response_model=TwoFactorSetup)
def start_two_factor(payload: PasswordConfirm, user: CurrentUser, db: DbSession) -> TwoFactorSetup:
    """Make a new secret to scan. It only takes effect once confirmed with /2fa/enable."""
    _check_password(user, payload.password)
    if user.totp_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, "Two-factor authentication is already on")
    user.totp_secret = two_factor.new_secret()
    user.totp_last_step = None
    db.commit()
    uri = two_factor.otpauth_uri(user.totp_secret, user.email)
    return TwoFactorSetup(
        secret=user.totp_secret, otpauth_uri=uri, qr_svg=two_factor.qr_svg_data_uri(uri)
    )


@router.post("/2fa/enable", response_model=RecoveryCodes)
def enable_two_factor(payload: TwoFactorCode, user: CurrentUser, db: DbSession) -> RecoveryCodes:
    """Turn 2FA on once the app shows a matching code. Returns the recovery codes, once."""
    if user.totp_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, "Two-factor authentication is already on")
    if not user.totp_secret:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Start the set-up first")
    step = two_factor.matching_step(user.totp_secret, payload.code)
    if step is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "That code doesn't match. Try the newest one."
        )
    codes = two_factor.new_recovery_codes()
    user.totp_enabled = True
    user.totp_last_step = step
    user.recovery_codes = [two_factor.hash_recovery_code(c) for c in codes]
    db.commit()
    return RecoveryCodes(recovery_codes=codes)


@router.post("/2fa/disable", response_model=UserOut)
def disable_two_factor(payload: TwoFactorDisable, user: CurrentUser, db: DbSession) -> User:
    _check_password(user, payload.password)
    if not user.totp_enabled:
        return user
    if not _use_second_factor(user, payload.code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Incorrect two-factor code")
    user.totp_enabled = False
    user.totp_secret = None
    user.totp_last_step = None
    user.recovery_codes = None
    db.commit()
    return user
