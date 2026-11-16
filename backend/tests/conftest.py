from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import barcodes, tmdb
from app.database import Base, get_db
from app.main import app

FAKE_TMDB = {
    ("movie", 603): tmdb.TmdbTitle(
        tmdb_id=603,
        title="The Matrix",
        year=1999,
        poster_url="https://image.tmdb.org/t/p/w342/matrix.jpg",
        genres=["Action", "Science Fiction"],
        runtime=136,
    ),
    ("movie", 949): tmdb.TmdbTitle(
        tmdb_id=949,
        title="Heat",
        year=1995,
        poster_url=None,
        genres=["Action", "Crime"],
        runtime=170,
    ),
    # Same TMDB id as Heat on purpose: film and TV ids overlap.
    ("tv", 949): tmdb.TmdbTitle(
        tmdb_id=949,
        title="The Matrix Chronicles",
        year=2003,
        poster_url=None,
        media_type="tv",
        genres=["Animation"],
        runtime=22,
    ),
}


@pytest.fixture(autouse=True)
def fake_tmdb(monkeypatch: pytest.MonkeyPatch) -> None:
    """Tests never call the real TMDB API."""

    def get_title(tmdb_id: int, media_type: str = "movie") -> tmdb.TmdbTitle:
        if (media_type, tmdb_id) not in FAKE_TMDB:
            raise tmdb.TmdbError("not found")
        return FAKE_TMDB[(media_type, tmdb_id)]

    def search_titles(query: str, limit: int = 12) -> list[tmdb.TmdbTitle]:
        return [t for t in FAKE_TMDB.values() if query.lower() in t.title.lower()][:limit]

    def get_details(tmdb_id: int, media_type: str = "movie") -> tmdb.TmdbDetails:
        if (media_type, tmdb_id) not in FAKE_TMDB:
            raise tmdb.TmdbError("not found")
        return tmdb.TmdbDetails(
            overview=f"About {FAKE_TMDB[(media_type, tmdb_id)].title}.",
            tagline=None,
            release_date="1999-03-31",
            cast=[tmdb.CastMember(name="Keanu Reeves", character="Neo", photo_url=None)],
            crew_label="Created by" if media_type == "tv" else "Directed by",
            crew=["Lana Wachowski", "Lilly Wachowski"],
            seasons=1 if media_type == "tv" else None,
            episodes=9 if media_type == "tv" else None,
        )

    monkeypatch.setattr(tmdb, "get_title", get_title)
    monkeypatch.setattr(tmdb, "get_details", get_details)
    monkeypatch.setattr(tmdb, "search_titles", search_titles)


@pytest.fixture(autouse=True)
def fake_barcodes(monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    """Tests never call the real barcode service. Add entries to the returned dict."""
    products: dict[str, str] = {}

    def lookup_product_title(barcode: str) -> str | None:
        return products.get(barcode)

    monkeypatch.setattr(barcodes, "lookup_product_title", lookup_product_title)
    return products


@pytest.fixture
def client() -> Iterator[TestClient]:
    """A test client backed by a fresh in-memory SQLite database."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    # No "with" block on purpose: that would run the lifespan against the real database.
    yield TestClient(app)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def register_and_login(client: TestClient, email: str, password: str = "s3cret-pass") -> dict:
    """Create a user and return the Authorization header for them."""
    response = client.post("/api/auth/register", json={"email": email, "password": password})
    assert response.status_code == 201, response.text
    response = client.post("/api/auth/login", data={"username": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def auth_headers(client: TestClient) -> dict:
    return register_and_login(client, "uros@example.com")
