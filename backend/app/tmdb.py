"""Small client for The Movie Database (TMDB) API. Covers both films and TV shows."""

from dataclasses import dataclass, field
from typing import Literal

import httpx

from app.config import settings

API_BASE = "https://api.themoviedb.org/3"
POSTER_BASE = "https://image.tmdb.org/t/p/w342"
PHOTO_BASE = "https://image.tmdb.org/t/p/w185"
CAST_LIMIT = 12

MediaType = Literal["movie", "tv"]
MEDIA_TYPES: tuple[MediaType, ...] = ("movie", "tv")


class TmdbError(Exception):
    """TMDB could not be reached or returned an error."""


class TmdbNotConfiguredError(TmdbError):
    """No TMDB_API_KEY has been set."""


@dataclass
class TmdbTitle:
    tmdb_id: int
    title: str
    year: int | None
    poster_url: str | None
    media_type: MediaType = "movie"
    genres: list[str] = field(default_factory=list)
    runtime: int | None = None


def _get(path: str, params: dict[str, str] | None = None) -> dict:
    if not settings.tmdb_api_key:
        raise TmdbNotConfiguredError("TMDB_API_KEY is not configured")
    try:
        response = httpx.get(
            f"{API_BASE}{path}",
            params={"api_key": settings.tmdb_api_key, **(params or {})},
            timeout=10,
        )
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise TmdbError("TMDB request failed") from exc


def _to_title(data: dict, media_type: MediaType) -> TmdbTitle:
    # Films have "title" and "release_date"; TV shows have "name" and "first_air_date".
    if media_type == "tv":
        name = data.get("name") or data.get("original_name") or ""
        date = data.get("first_air_date") or ""
        run_times = data.get("episode_run_time") or []
        runtime = run_times[0] if run_times else None
    else:
        name = data.get("title") or data.get("original_title") or ""
        date = data.get("release_date") or ""
        runtime = data.get("runtime")
    poster_path = data.get("poster_path")
    return TmdbTitle(
        tmdb_id=data["id"],
        title=name,
        year=int(date[:4]) if date[:4].isdigit() else None,
        poster_url=f"{POSTER_BASE}{poster_path}" if poster_path else None,
        media_type=media_type,
        # Only the details endpoints return genre names and runtime.
        genres=[genre["name"] for genre in data.get("genres") or [] if genre.get("name")],
        runtime=runtime or None,
    )


def search_titles(query: str, limit: int = 12) -> list[TmdbTitle]:
    """Search films and TV shows together, in TMDB's relevance order."""
    data = _get("/search/multi", {"query": query, "include_adult": "false"})
    results = [
        _to_title(result, result["media_type"])
        for result in data.get("results", [])
        # Multi-search also returns people; skip them.
        if result.get("media_type") in MEDIA_TYPES
    ]
    return results[:limit]


def get_title(tmdb_id: int, media_type: MediaType = "movie") -> TmdbTitle:
    return _to_title(_get(f"/{media_type}/{tmdb_id}"), media_type)


@dataclass
class CastMember:
    name: str
    character: str | None
    photo_url: str | None


@dataclass
class TmdbDetails:
    """Everything shown on a title's detail panel."""

    overview: str | None
    tagline: str | None
    release_date: str | None
    cast: list[CastMember]
    # "Directed by" names for films, "Created by" names for TV shows.
    crew_label: str
    crew: list[str]
    seasons: int | None = None
    episodes: int | None = None


def _cast_member(person: dict) -> CastMember:
    # TV "aggregate_credits" list every role a person played; films have one "character".
    roles = person.get("roles") or []
    character = person.get("character") or (roles[0].get("character") if roles else None)
    photo = person.get("profile_path")
    return CastMember(
        name=person.get("name") or "",
        character=character or None,
        photo_url=f"{PHOTO_BASE}{photo}" if photo else None,
    )


def get_details(tmdb_id: int, media_type: MediaType = "movie") -> TmdbDetails:
    return get_full(tmdb_id, media_type)[1]


def get_full(tmdb_id: int, media_type: MediaType = "movie") -> tuple[TmdbTitle, TmdbDetails]:
    """Basics (title, year, poster, genres, runtime) and details in a single TMDB call."""
    credits_key = "aggregate_credits" if media_type == "tv" else "credits"
    data = _get(f"/{media_type}/{tmdb_id}", {"append_to_response": credits_key})
    return _to_title(data, media_type), _to_details(data, media_type, credits_key)


def _to_details(data: dict, media_type: MediaType, credits_key: str) -> TmdbDetails:
    credits = data.get(credits_key) or {}
    cast = [_cast_member(person) for person in (credits.get("cast") or [])[:CAST_LIMIT]]

    if media_type == "tv":
        crew_label = "Created by"
        crew = [person["name"] for person in data.get("created_by") or [] if person.get("name")]
        release_date = data.get("first_air_date")
    else:
        crew_label = "Directed by"
        crew = [
            person["name"]
            for person in credits.get("crew") or []
            if person.get("job") == "Director" and person.get("name")
        ]
        release_date = data.get("release_date")

    return TmdbDetails(
        overview=data.get("overview") or None,
        tagline=data.get("tagline") or None,
        release_date=release_date or None,
        cast=[member for member in cast if member.name],
        crew_label=crew_label,
        crew=list(dict.fromkeys(crew)),  # Drop duplicates, keep order.
        seasons=data.get("number_of_seasons") if media_type == "tv" else None,
        episodes=data.get("number_of_episodes") if media_type == "tv" else None,
    )
