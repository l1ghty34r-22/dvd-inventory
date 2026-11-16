"""Small client for The Movie Database (TMDB) API. Covers both films and TV shows."""

from dataclasses import dataclass, field
from typing import Literal

import httpx

from app.config import settings

API_BASE = "https://api.themoviedb.org/3"
POSTER_BASE = "https://image.tmdb.org/t/p/w342"

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
