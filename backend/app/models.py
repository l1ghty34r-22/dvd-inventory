from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Bumped when the password changes, which signs out every other device (tokens carry it).
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Two-factor authentication. The secret is set while setting up, and only counts once
    # totp_enabled is true. totp_last_step stops the same code being used twice.
    totp_secret: Mapped[str | None] = mapped_column(String(64))
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    totp_last_step: Mapped[int | None] = mapped_column(Integer)
    # SHA-256 hashes of the unused one-time recovery codes.
    recovery_codes: Mapped[list[str] | None] = mapped_column(JSON)

    # A few lines about yourself, shown on your profile.
    bio: Mapped[str | None] = mapped_column(Text)

    items: Mapped[list["InventoryItem"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
    avatar: Mapped["Avatar | None"] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def avatar_url(self) -> str | None:
        return f"/api/avatars/{self.avatar.key}" if self.avatar else None


class Avatar(Base):
    """A user's profile picture, kept in the database so it survives redeploys.

    `key` is random and changes with every upload, so the picture's address can't be guessed
    and browsers can cache each version for good.
    """

    __tablename__ = "avatars"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    key: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    content_type: Mapped[str] = mapped_column(String(20))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="avatar")


class Movie(Base):
    """Shared film or TV show metadata. Fetched once, referenced by many inventory items."""

    __tablename__ = "movies"
    # TMDB numbers films and TV shows separately, so an id is only unique within its type.
    __table_args__ = (Index("uq_movies_media_tmdb", "media_type", "tmdb_id", unique=True),)

    id: Mapped[int] = mapped_column(primary_key=True)
    media_type: Mapped[str] = mapped_column(String(10), default="movie", server_default="movie")
    tmdb_id: Mapped[int | None] = mapped_column(Integer, index=True)
    title: Mapped[str] = mapped_column(String(255), index=True)
    year: Mapped[int | None] = mapped_column(Integer)
    poster_url: Mapped[str | None] = mapped_column(String(500))
    genres: Mapped[list[str]] = mapped_column(JSON, default=list)
    runtime: Mapped[int | None] = mapped_column(Integer)


class InventoryItem(Base):
    """One physical DVD owned by one user."""

    __tablename__ = "inventory_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    movie_id: Mapped[int] = mapped_column(ForeignKey("movies.id"), index=True)
    # EAN-13 / EAN-8 digits, when the disc was scanned or the code typed in.
    barcode: Mapped[str | None] = mapped_column(String(13), index=True)
    # "dvd", "bluray" or "uhd" (4K Ultra HD Blu-ray).
    format: Mapped[str] = mapped_column(String(10), default="dvd", server_default="dvd")
    condition: Mapped[str | None] = mapped_column(String(50))
    location: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    owner: Mapped[User] = relationship(back_populates="items")
    movie: Mapped[Movie] = relationship(lazy="joined")


class BarcodeProduct(Base):
    """What the barcode database called a product, kept so each code is looked up only once.

    Product names are public catalogue data, so the cache is shared by all users.
    """

    __tablename__ = "barcode_products"

    barcode: Mapped[str] = mapped_column(String(13), primary_key=True)
    product_title: Mapped[str] = mapped_column(String(500))
    looked_up_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
