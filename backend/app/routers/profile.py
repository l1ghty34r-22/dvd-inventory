"""Your bio and profile picture."""

import secrets

from fastapi import APIRouter, HTTPException, Response, UploadFile, status

from app.deps import CurrentUser, DbSession
from app.models import Avatar, User
from app.schemas import ProfileUpdate, UserOut

router = APIRouter(tags=["profile"])

# The browser shrinks pictures to 256x256 before sending (about 20-40 KB), so this is generous.
MAX_AVATAR_BYTES = 2 * 1024 * 1024


def image_type(data: bytes) -> str | None:
    """Tell the image format from its first bytes, rather than trusting the file name."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return None


@router.patch("/api/auth/profile", response_model=UserOut)
def update_profile(payload: ProfileUpdate, user: CurrentUser, db: DbSession) -> User:
    user.bio = (payload.bio or "").strip() or None
    db.commit()
    return user


@router.put("/api/auth/avatar", response_model=UserOut)
async def upload_avatar(file: UploadFile, user: CurrentUser, db: DbSession) -> User:
    data = await file.read(MAX_AVATAR_BYTES + 1)
    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "That picture is too big (2 MB at most)"
        )
    content_type = image_type(data)
    if content_type is None:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Use a JPEG, PNG, WebP or GIF picture"
        )
    if user.avatar is None:
        user.avatar = Avatar(key="", content_type="", data=b"")
    user.avatar.key = secrets.token_hex(16)
    user.avatar.content_type = content_type
    user.avatar.data = data
    db.commit()
    db.refresh(user)
    return user


@router.delete("/api/auth/avatar", response_model=UserOut)
def remove_avatar(user: CurrentUser, db: DbSession) -> User:
    if user.avatar is not None:
        user.avatar = None
        db.commit()
        db.refresh(user)
    return user


@router.get("/api/avatars/{key}", include_in_schema=False)
def get_avatar(key: str, db: DbSession) -> Response:
    """Public (an <img> can't send a login token), but the key is random and unguessable."""
    avatar = db.query(Avatar).filter(Avatar.key == key).one_or_none()
    if avatar is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such picture")
    return Response(
        content=avatar.data,
        media_type=avatar.content_type,
        # The key changes with every upload, so each version can be cached forever.
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
