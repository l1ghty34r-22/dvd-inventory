from collections import Counter
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app import tmdb
from app.deps import CurrentUser, DbSession
from app.models import InventoryItem, Movie
from app.schemas import (
    FilmRef,
    InventoryItemCreate,
    InventoryItemOut,
    InventoryItemUpdate,
    InventoryPage,
    InventoryStats,
)

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


def _find_or_create_movie(db: DbSession, payload: InventoryItemCreate) -> Movie:
    if payload.tmdb_id is not None:
        query = select(Movie).where(Movie.tmdb_id == payload.tmdb_id)
    else:
        query = select(Movie).where(
            Movie.tmdb_id.is_(None),
            func.lower(Movie.title) == payload.title.lower(),
            Movie.year.is_(None) if payload.year is None else Movie.year == payload.year,
        )
    movie = db.scalar(query)
    if movie is None:
        movie = _new_movie(payload)
        db.add(movie)
        db.flush()
    return movie


def _new_movie(payload: InventoryItemCreate) -> Movie:
    if payload.tmdb_id is not None:
        # Prefer TMDB's own data over whatever the client sent.
        try:
            details = tmdb.get_movie(payload.tmdb_id)
        except tmdb.TmdbError:
            pass  # Fall back to the submitted fields so adding still works offline.
        else:
            return Movie(
                tmdb_id=details.tmdb_id,
                title=details.title or payload.title,
                year=details.year,
                poster_url=details.poster_url,
                genres=details.genres,
                runtime=details.runtime,
            )
    return Movie(
        tmdb_id=payload.tmdb_id,
        title=payload.title,
        year=payload.year,
        poster_url=payload.poster_url,
        genres=[],
    )


def _get_own_item(db: DbSession, user_id: int, item_id: int) -> InventoryItem:
    item = db.get(InventoryItem, item_id)
    # 404 (not 403) so we do not reveal that another user's item exists.
    if item is None or item.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")
    return item


@router.get("", response_model=InventoryPage)
def list_items(
    user: CurrentUser,
    db: DbSession,
    q: str | None = Query(default=None, description="Filter by title"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> InventoryPage:
    filters = [InventoryItem.user_id == user.id]
    if q:
        filters.append(Movie.title.ilike(f"%{q}%"))

    total = db.scalar(
        select(func.count(InventoryItem.id)).join(InventoryItem.movie).where(*filters)
    )
    items = db.scalars(
        select(InventoryItem)
        .join(InventoryItem.movie)
        .where(*filters)
        .order_by(InventoryItem.added_at.desc(), InventoryItem.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return InventoryPage(items=list(items), total=total or 0)


@router.get("/stats", response_model=InventoryStats)
def stats(user: CurrentUser, db: DbSession) -> InventoryStats:
    """Headline numbers for the home screen."""
    mine = InventoryItem.user_id == user.id
    now = datetime.now(UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total = db.scalar(select(func.count(InventoryItem.id)).where(mine)) or 0
    added_this_month = (
        db.scalar(
            select(func.count(InventoryItem.id)).where(mine, InventoryItem.added_at >= month_start)
        )
        or 0
    )

    dated = (
        select(Movie.title, Movie.year)
        .join(InventoryItem, InventoryItem.movie_id == Movie.id)
        .where(mine, Movie.year.is_not(None))
    )
    oldest = db.execute(dated.order_by(Movie.year.asc(), Movie.title).limit(1)).first()
    newest = db.execute(dated.order_by(Movie.year.desc(), Movie.title).limit(1)).first()

    # Genres are a JSON list per film, so count them here rather than in SQL.
    genre_lists = db.scalars(
        select(Movie.genres).join(InventoryItem, InventoryItem.movie_id == Movie.id).where(mine)
    ).all()
    counts = Counter(genre for genres in genre_lists for genre in genres or [])
    top_genre = min(counts, key=lambda genre: (-counts[genre], genre)) if counts else None

    return InventoryStats(
        total=total,
        added_this_month=added_this_month,
        top_genre=top_genre,
        oldest=FilmRef(title=oldest.title, year=oldest.year) if oldest else None,
        newest=FilmRef(title=newest.title, year=newest.year) if newest else None,
    )


@router.post("", response_model=InventoryItemOut, status_code=status.HTTP_201_CREATED)
def add_item(payload: InventoryItemCreate, user: CurrentUser, db: DbSession) -> InventoryItem:
    movie = _find_or_create_movie(db, payload)
    item = InventoryItem(
        user_id=user.id,
        movie_id=movie.id,
        condition=payload.condition,
        location=payload.location,
        notes=payload.notes,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{item_id}", response_model=InventoryItemOut)
def update_item(
    item_id: int, payload: InventoryItemUpdate, user: CurrentUser, db: DbSession
) -> InventoryItem:
    item = _get_own_item(db, user.id, item_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: int, user: CurrentUser, db: DbSession) -> None:
    item = _get_own_item(db, user.id, item_id)
    db.delete(item)
    db.commit()
