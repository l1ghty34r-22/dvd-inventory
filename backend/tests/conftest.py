from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import tmdb
from app.database import Base, get_db
from app.main import app

FAKE_TMDB = {
    603: tmdb.TmdbMovie(
        tmdb_id=603,
        title="The Matrix",
        year=1999,
        poster_url="https://image.tmdb.org/t/p/w342/matrix.jpg",
        genres=["Action", "Science Fiction"],
        runtime=136,
    ),
    949: tmdb.TmdbMovie(
        tmdb_id=949,
        title="Heat",
        year=1995,
        poster_url=None,
        genres=["Action", "Crime"],
        runtime=170,
    ),
}


@pytest.fixture(autouse=True)
def fake_tmdb(monkeypatch: pytest.MonkeyPatch) -> None:
    """Tests never call the real TMDB API."""

    def get_movie(tmdb_id: int) -> tmdb.TmdbMovie:
        if tmdb_id not in FAKE_TMDB:
            raise tmdb.TmdbError("not found")
        return FAKE_TMDB[tmdb_id]

    def search_movies(query: str, limit: int = 10) -> list[tmdb.TmdbMovie]:
        return [m for m in FAKE_TMDB.values() if query.lower() in m.title.lower()][:limit]

    monkeypatch.setattr(tmdb, "get_movie", get_movie)
    monkeypatch.setattr(tmdb, "search_movies", search_movies)


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
