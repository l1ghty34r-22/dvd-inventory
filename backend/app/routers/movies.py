from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app import barcodes, tmdb
from app.deps import CurrentUser, DbSession
from app.models import BarcodeProduct, InventoryItem
from app.schemas import BarcodeLookup, MovieOut, MovieSearchResult

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

    return [
        MovieSearchResult(
            tmdb_id=title.tmdb_id,
            media_type=title.media_type,
            title=title.title,
            year=title.year,
            poster_url=title.poster_url,
        )
        for title in results
    ]


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
        return BarcodeLookup(
            barcode=barcode,
            product_title=None,
            title_guess=item.movie.title,
            match=MovieOut.model_validate(item.movie),
            owned_count=owned_count,
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

    return BarcodeLookup(
        barcode=barcode,
        product_title=product_title,
        title_guess=barcodes.clean_title(product_title) if product_title else None,
        match=None,
        owned_count=0,
    )
