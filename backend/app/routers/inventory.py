from collections import Counter
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select

from app import barcodes, tmdb
from app.deps import CurrentUser, DbSession
from app.models import InventoryItem, Movie
from app.schemas import (
    CastMemberOut,
    FilmRef,
    InventoryItemCreate,
    InventoryItemDetails,
    InventoryItemOut,
    InventoryItemUpdate,
    InventoryPage,
    InventoryStats,
    NamedCount,
    OwnedTitle,
    ProfileStats,
    TitleDetails,
)

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


def _find_or_create_movie(db: DbSession, payload: InventoryItemCreate) -> Movie:
    if payload.tmdb_id is not None:
        query = select(Movie).where(
            Movie.media_type == payload.media_type, Movie.tmdb_id == payload.tmdb_id
        )
    else:
        query = select(Movie).where(
            Movie.media_type == payload.media_type,
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
            details = tmdb.get_title(payload.tmdb_id, payload.media_type)
        except tmdb.TmdbError:
            pass  # Fall back to the submitted fields so adding still works offline.
        else:
            return Movie(
                media_type=details.media_type,
                tmdb_id=details.tmdb_id,
                title=details.title or payload.title,
                year=details.year,
                poster_url=details.poster_url,
                genres=details.genres,
                runtime=details.runtime,
            )
    return Movie(
        media_type=payload.media_type,
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
    q: str | None = Query(default=None, description="Filter by title or barcode"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> InventoryPage:
    filters = [InventoryItem.user_id == user.id]
    if q:
        title_matches = Movie.title.ilike(f"%{q}%")
        try:
            barcode = barcodes.normalize(q)
        except ValueError:
            filters.append(title_matches)
        else:
            filters.append(or_(title_matches, InventoryItem.barcode == barcode))

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
    tv_shows = (
        db.scalar(
            select(func.count(InventoryItem.id))
            .join(InventoryItem.movie)
            .where(mine, Movie.media_type == "tv")
        )
        or 0
    )
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
        films=total - tv_shows,
        tv_shows=tv_shows,
        added_this_month=added_this_month,
        top_genre=top_genre,
        oldest=FilmRef(title=oldest.title, year=oldest.year) if oldest else None,
        newest=FilmRef(title=newest.title, year=newest.year) if newest else None,
    )


@router.get("/profile", response_model=ProfileStats)
def profile(user: CurrentUser, db: DbSession) -> ProfileStats:
    """The whole collection broken down: films and shows, genres, decades, every title."""
    rows = db.execute(
        select(Movie, func.count(InventoryItem.id))
        .join(InventoryItem, InventoryItem.movie_id == Movie.id)
        .where(InventoryItem.user_id == user.id)
        .group_by(Movie.id)
        .order_by(func.lower(Movie.title), Movie.year)
    ).all()

    films: list[OwnedTitle] = []
    shows: list[OwnedTitle] = []
    genres: Counter[str] = Counter()
    decades: Counter[int] = Counter()
    film_minutes = 0
    for movie, copies in rows:
        owned = OwnedTitle(
            movie_id=movie.id,
            title=movie.title,
            year=movie.year,
            poster_url=movie.poster_url,
            genres=movie.genres or [],
            copies=copies,
        )
        (shows if movie.media_type == "tv" else films).append(owned)
        genres.update(set(movie.genres or []))
        if movie.year:
            decades[movie.year // 10 * 10] += 1
        if movie.media_type != "tv" and movie.runtime:
            film_minutes += movie.runtime

    return ProfileStats(
        email=user.email,
        member_since=user.created_at,
        total_discs=sum(copies for _, copies in rows),
        films=len(films),
        tv_shows=len(shows),
        film_minutes=film_minutes,
        genres=[
            NamedCount(name=name, count=count)
            for name, count in sorted(genres.items(), key=lambda kv: (-kv[1], kv[0]))
        ],
        decades=[
            NamedCount(name=f"{decade}s", count=decades[decade]) for decade in sorted(decades)
        ],
        film_titles=films,
        tv_titles=shows,
    )


@router.post("", response_model=InventoryItemOut, status_code=status.HTTP_201_CREATED)
def add_item(payload: InventoryItemCreate, user: CurrentUser, db: DbSession) -> InventoryItem:
    movie = _find_or_create_movie(db, payload)
    item = InventoryItem(
        user_id=user.id,
        movie_id=movie.id,
        barcode=payload.barcode,
        condition=payload.condition,
        location=payload.location,
        notes=payload.notes,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/{item_id}", response_model=InventoryItemDetails)
def get_item(item_id: int, user: CurrentUser, db: DbSession) -> InventoryItemDetails:
    """One disc on the shelf, with the title's description, cast and crew from TMDB."""
    item = _get_own_item(db, user.id, item_id)
    movie = item.movie
    result = InventoryItemDetails(item=InventoryItemOut.model_validate(item), details=None)
    if movie.tmdb_id is None:
        return result

    try:
        full = tmdb.get_details(movie.tmdb_id, movie.media_type)
    except tmdb.TmdbNotConfiguredError:
        result.details_error = "Details need a TMDB key on the server."
        return result
    except tmdb.TmdbError:
        result.details_error = "Could not load details from TMDB. Try again in a moment."
        return result

    result.details = TitleDetails(
        overview=full.overview,
        tagline=full.tagline,
        release_date=full.release_date,
        cast=[CastMemberOut(**vars(member)) for member in full.cast],
        crew_label=full.crew_label,
        crew=full.crew,
        seasons=full.seasons,
        episodes=full.episodes,
    )
    return result


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
