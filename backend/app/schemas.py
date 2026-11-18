from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app import barcodes

MediaType = Literal["movie", "tv"]
# DVD, Blu-ray, or 4K Ultra HD Blu-ray.
DiscFormat = Literal["dvd", "bluray", "uhd"]


def _password_fits_bcrypt(value: str) -> str:
    # bcrypt only hashes the first 72 bytes, so reject anything longer.
    if len(value.encode("utf-8")) > 72:
        raise ValueError("Password must be at most 72 bytes")
    return value


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)

    _check_password = field_validator("password")(_password_fits_bcrypt)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    two_factor_enabled: bool = Field(validation_alias="totp_enabled", default=False)
    bio: str | None = None
    avatar_url: str | None = None


BIO_MAX = 300


class ProfileUpdate(BaseModel):
    bio: str | None = Field(default=None, max_length=BIO_MAX)


class EmailChange(BaseModel):
    new_email: EmailStr
    password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)

    _check_password = field_validator("new_password")(_password_fits_bcrypt)


class PasswordConfirm(BaseModel):
    password: str


class TwoFactorSetup(BaseModel):
    secret: str
    otpauth_uri: str
    qr_svg: str


class TwoFactorCode(BaseModel):
    code: str = Field(min_length=6, max_length=20)


class TwoFactorDisable(BaseModel):
    password: str
    code: str = Field(min_length=6, max_length=20)


class RecoveryCodes(BaseModel):
    recovery_codes: list[str]


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
    format: DiscFormat = "dvd"
    condition: str | None = Field(default=None, max_length=50)
    location: str | None = Field(default=None, max_length=100)
    notes: str | None = None

    @field_validator("barcode")
    @classmethod
    def normalize_barcode(cls, value: str | None) -> str | None:
        return barcodes.normalize(value) if value else None


class InventoryItemUpdate(BaseModel):
    format: DiscFormat | None = None
    condition: str | None = Field(default=None, max_length=50)
    location: str | None = Field(default=None, max_length=100)
    notes: str | None = None


class InventoryItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    barcode: str | None
    format: DiscFormat
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
    films: int
    tv_shows: int
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
    # Set when the barcode database could not be asked (daily limit, outage). The barcode is
    # still valid and can be saved with whatever title the user picks.
    lookup_error: str | None = None
    # Read from the product name ("[Blu-ray]", "4K"), or the format of the copy you own.
    format_guess: DiscFormat | None = None
    # The title the barcode most likely is, and other plausible matches to choose from.
    best_match: MovieSearchResult | None = None
    candidates: list[MovieSearchResult] = []


class NamedCount(BaseModel):
    name: str
    count: int


class OwnedTitle(BaseModel):
    """One title on the shelf, with how many copies of it the user has."""

    movie_id: int
    title: str
    year: int | None
    poster_url: str | None
    genres: list[str]
    copies: int


class ProfileStats(BaseModel):
    email: EmailStr
    member_since: datetime
    total_discs: int
    films: int
    tv_shows: int
    # Summed over films that have a runtime from TMDB. TV runtimes are per episode, so skipped.
    film_minutes: int
    # Counted per title (not per copy), most common first.
    genres: list[NamedCount]
    # "1990s" and so on, oldest first. Titles without a year are left out.
    decades: list[NamedCount]
    # Discs per format ("DVD", "Blu-ray", "4K Ultra HD"), formats you own none of left out.
    formats: list[NamedCount]
    film_titles: list[OwnedTitle]
    tv_titles: list[OwnedTitle]


class CastMemberOut(BaseModel):
    name: str
    character: str | None
    photo_url: str | None


class TitleDetails(BaseModel):
    overview: str | None
    tagline: str | None
    release_date: str | None
    cast: list[CastMemberOut]
    crew_label: str
    crew: list[str]
    seasons: int | None
    episodes: int | None


class InventoryItemDetails(BaseModel):
    item: InventoryItemOut
    # None when the title was typed in by hand, or TMDB could not be reached.
    details: TitleDetails | None
    details_error: str | None = None


class TitlePreview(BaseModel):
    """A film or show from TMDB, whether or not it is on the user's shelf."""

    tmdb_id: int
    media_type: MediaType
    title: str
    year: int | None
    poster_url: str | None
    genres: list[str]
    runtime: int | None
    details: TitleDetails
    owned_count: int
