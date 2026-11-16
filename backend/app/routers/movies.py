from fastapi import APIRouter, HTTPException, Query, status

from app import tmdb
from app.deps import CurrentUser
from app.schemas import MovieSearchResult

router = APIRouter(prefix="/api/movies", tags=["movies"])


@router.get("/search", response_model=list[MovieSearchResult])
def search_movies(
    _user: CurrentUser, q: str = Query(min_length=1, max_length=100)
) -> list[MovieSearchResult]:
    """Look up films on TMDB so the user can pick the right one to add."""
    try:
        results = tmdb.search_movies(q)
    except tmdb.TmdbNotConfiguredError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except tmdb.TmdbError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc

    return [
        MovieSearchResult(
            tmdb_id=movie.tmdb_id,
            title=movie.title,
            year=movie.year,
            poster_url=movie.poster_url,
        )
        for movie in results
    ]
