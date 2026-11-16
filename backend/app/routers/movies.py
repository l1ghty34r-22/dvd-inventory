from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app import barcodes, tmdb
from app.deps import CurrentUser, DbSession
from app.models import BarcodeProduct, InventoryItem, Movie
from app.schemas import (
    BarcodeLookup,
    CastMemberOut,
    MovieOut,
    MovieSearchResult,
    TitleDetails,
    TitlePreview,
)

router = APIRouter(prefix="/api/movies", tags=["movies"])


@router.get("/search", response_model=list[MovieSearchResult])
def search_titles(
    _user: CurrentUser, q: str = Query(min_length=1, max_length=100)
) -> list[MovieSearchResult]:
    """Look up films and TV shows on TMDB so the user can pick the right one to add."""
    try:
        results = tmdb.search_titles(q)
    except tmdb.TmdbNotConfiguredError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except tmdb.TmdbError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc

    return [_to_result(title) for title in results]


def _to_result(title: tmdb.TmdbTitle) -> MovieSearchResult:
    return MovieSearchResult(
        tmdb_id=title.tmdb_id,
        media_type=title.media_type,
        title=title.title,
        year=title.year,
        poster_url=title.poster_url,
    )


def _match_product(lookup: BarcodeLookup) -> BarcodeLookup:
    """Search TMDB for the product's cleaned-up name and pick the most likely title."""
    if not lookup.title_guess:
        return lookup
    try:
        results = tmdb.search_titles(lookup.title_guess)
    except tmdb.TmdbError:
        return lookup  # The user can still search by hand.
    best = barcodes.pick_best(lookup.product_title or "", lookup.title_guess, results)
    if best is not None:
        lookup.best_match = _to_result(best)
        lookup.candidates = [_to_result(r) for r in results if r is not best][:5]
    return lookup


@router.get("/barcode/{code}", response_model=BarcodeLookup)
def lookup_barcode(code: str, user: CurrentUser, db: DbSession) -> BarcodeLookup:
    """Work out what a scanned DVD is.

    If a disc with this barcode is already on the user's shelf, that answers it without calling
    out. Otherwise the barcode database gives a product name, cleaned into a title to search for.
    """
    try:
        barcode = barcodes.normalize(code)
    except ValueError as exc:
        # 422, like any other invalid input.
        raise HTTPException(422, str(exc)) from exc

    mine = (InventoryItem.user_id == user.id, InventoryItem.barcode == barcode)
    owned_count = db.scalar(select(func.count(InventoryItem.id)).where(*mine)) or 0
    if owned_count:
        item = db.scalars(
            select(InventoryItem).where(*mine).order_by(InventoryItem.id.desc()).limit(1)
        ).one()
        movie = item.movie
        return BarcodeLookup(
            barcode=barcode,
            product_title=None,
            title_guess=movie.title,
            match=MovieOut.model_validate(movie),
            owned_count=owned_count,
            best_match=MovieSearchResult(
                tmdb_id=movie.tmdb_id,
                media_type=movie.media_type,
                title=movie.title,
                year=movie.year,
                poster_url=movie.poster_url,
            )
            if movie.tmdb_id is not None
            else None,
        )

    cached = db.get(BarcodeProduct, barcode)
    if cached is not None:
        product_title = cached.product_title
    else:
        try:
            product_title = barcodes.lookup_product_title(barcode)
        except barcodes.BarcodeError as exc:
            # Not fatal: the user can still search by title and keep the barcode.
            return BarcodeLookup(
                barcode=barcode,
                product_title=None,
                title_guess=None,
                match=None,
                owned_count=0,
                lookup_error=str(exc),
            )
        if product_title:
            db.add(BarcodeProduct(barcode=barcode, product_title=product_title[:500]))
            db.commit()

    return _match_product(
        BarcodeLookup(
            barcode=barcode,
            product_title=product_title,
            title_guess=barcodes.clean_title(product_title) if product_title else None,
            match=None,
            owned_count=0,
        )
    )


@router.get("/{media_type}/{tmdb_id}", response_model=TitlePreview)
def preview_title(
    media_type: tmdb.MediaType, tmdb_id: int, user: CurrentUser, db: DbSession
) -> TitlePreview:
    """A title's page from TMDB, with how many copies the user already owns."""
    try:
        title, details = tmdb.get_full(tmdb_id, media_type)
    except tmdb.TmdbNotConfiguredError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except tmdb.TmdbError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not load this title") from exc

    owned_count = (
        db.scalar(
            select(func.count(InventoryItem.id))
            .join(InventoryItem.movie)
            .where(
                InventoryItem.user_id == user.id,
                Movie.media_type == media_type,
                Movie.tmdb_id == tmdb_id,
            )
        )
        or 0
    )
    return TitlePreview(
        tmdb_id=title.tmdb_id,
        media_type=title.media_type,
        title=title.title,
        year=title.year,
        poster_url=title.poster_url,
        genres=title.genres,
        runtime=title.runtime,
        details=TitleDetails(
            overview=details.overview,
            tagline=details.tagline,
            release_date=details.release_date,
            cast=[CastMemberOut(**vars(member)) for member in details.cast],
            crew_label=details.crew_label,
            crew=details.crew,
            seasons=details.seasons,
            episodes=details.episodes,
        ),
        owned_count=owned_count,
    )
