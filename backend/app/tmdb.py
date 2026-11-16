"""Small client for The Movie Database (TMDB) API."""

from dataclasses import dataclass, field

import httpx

from app.config import settings

API_BASE = "https://api.themoviedb.org/3"
POSTER_BASE = "https://image.tmdb.org/t/p/w342"


class TmdbError(Exception):
    """TMDB could not be reached or returned an error."""


class TmdbNotConfiguredError(TmdbError):
    """No TMDB_API_KEY has been set."""


@dataclass
class TmdbMovie:
    tmdb_id: int
    title: str
    year: int | None
    poster_url: str | None
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


def _to_movie(data: dict) -> TmdbMovie:
    release_date = data.get("release_date") or ""
    poster_path = data.get("poster_path")
    return TmdbMovie(
        tmdb_id=data["id"],
        title=data.get("title") or "",
        year=int(release_date[:4]) if release_date[:4].isdigit() else None,
        poster_url=f"{POSTER_BASE}{poster_path}" if poster_path else None,
        # Only the details endpoint returns genre names and runtime.
        genres=[genre["name"] for genre in data.get("genres") or [] if genre.get("name")],
        runtime=data.get("runtime") or None,
    )


def search_movies(query: str, limit: int = 10) -> list[TmdbMovie]:
    data = _get("/search/movie", {"query": query})
    return [_to_movie(result) for result in data.get("results", [])[:limit]]


def get_movie(tmdb_id: int) -> TmdbMovie:
    return _to_movie(_get(f"/movie/{tmdb_id}"))
