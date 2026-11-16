from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app import barcodes

MediaType = Literal["movie", "tv"]


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)

    @field_validator("password")
    @classmethod
    def password_fits_bcrypt(cls, value: str) -> str:
        # bcrypt only hashes the first 72 bytes, so reject anything longer.
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 bytes")
        return value


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MovieOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    media_type: MediaType
    tmdb_id: int | None
    title: str
    year: int | None
    poster_url: str | None
    genres: list[str]
    runtime: int | None


class MovieSearchResult(BaseModel):
    tmdb_id: int
    media_type: MediaType
    title: str
    year: int | None
    poster_url: str | None


class InventoryItemCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    year: int | None = Field(default=None, ge=1880, le=2100)
    tmdb_id: int | None = None
    media_type: MediaType = "movie"
    poster_url: str | None = Field(default=None, max_length=500)
    barcode: str | None = None
    condition: str | None = Field(default=None, max_length=50)
    location: str | None = Field(default=None, max_length=100)
    notes: str | None = None

    @field_validator("barcode")
    @classmethod
    def normalize_barcode(cls, value: str | None) -> str | None:
        return barcodes.normalize(value) if value else None


class InventoryItemUpdate(BaseModel):
    condition: str | None = Field(default=None, max_length=50)
    location: str | None = Field(default=None, max_length=100)
    notes: str | None = None


class InventoryItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    barcode: str | None
    condition: str | None
    location: str | None
    notes: str | None
    added_at: datetime
    movie: MovieOut


class InventoryPage(BaseModel):
    items: list[InventoryItemOut]
    total: int


class FilmRef(BaseModel):
    title: str
    year: int


class InventoryStats(BaseModel):
    total: int
    added_this_month: int
    top_genre: str | None
    oldest: FilmRef | None
    newest: FilmRef | None


class BarcodeLookup(BaseModel):
    barcode: str
    # What the shop database calls the product, e.g. "Heat (DVD, 1995, Widescreen)".
    product_title: str | None
    # A cleaned-up title to search TMDB with, e.g. "Heat". None when nothing is known.
    title_guess: str | None
    # The title already on your shelf with this barcode, if any.
    match: MovieOut | None
    owned_count: int
