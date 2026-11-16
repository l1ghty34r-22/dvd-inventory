import pytest
from sqlalchemy import create_engine, inspect, text

from app import barcodes
from app.database import upgrade_schema
from tests.conftest import register_and_login

HEAT_UPC = "085391163428"  # UPC-A, 12 digits
HEAT_EAN = "0085391163428"  # the same code as EAN-13


@pytest.mark.parametrize(
    ("code", "expected"),
    [
        (HEAT_UPC, HEAT_EAN),
        (HEAT_EAN, HEAT_EAN),
        ("0" + HEAT_EAN, HEAT_EAN),
        ("0 85391 16342 8", HEAT_EAN),
        ("5051892008594", "5051892008594"),
        ("96385074", "96385074"),
    ],
)
def test_normalize(code, expected):
    assert barcodes.normalize(code) == expected


@pytest.mark.parametrize("code", ["", "abc", "12345", "085391163429", "50518920085941"])
def test_normalize_rejects_bad_codes(code):
    with pytest.raises(ValueError):
        barcodes.normalize(code)


@pytest.mark.parametrize(
    ("product", "expected"),
    [
        ("Heat (DVD, 1995, Widescreen)", "Heat"),
        ("The Matrix [Blu-ray] [1999] [Region Free]", "The Matrix"),
        ("Friends: The Complete First Season", "Friends"),
        ("Lost - Season 2 (7-Disc Set)", "Lost"),
        ("Breaking Bad Complete Series Box Set DVD", "Breaking Bad"),
        ("Alien Collector's Edition 2-Disc DVD", "Alien"),
        ("A Series of Unfortunate Events", "A Series of Unfortunate Events"),
        ("New Girl Season One", "New Girl"),
        ("DVD", "DVD"),
    ],
)
def test_clean_title(product, expected):
    assert barcodes.clean_title(product) == expected


def test_lookup_unknown_barcode(client, auth_headers):
    response = client.get(f"/api/movies/barcode/{HEAT_UPC}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {
        "barcode": HEAT_EAN,
        "product_title": None,
        "title_guess": None,
        "match": None,
        "owned_count": 0,
    }


def test_lookup_known_product(client, auth_headers, fake_barcodes):
    fake_barcodes[HEAT_EAN] = "Heat (DVD, 1995, Widescreen)"
    body = client.get(f"/api/movies/barcode/{HEAT_UPC}", headers=auth_headers).json()
    assert body["product_title"] == "Heat (DVD, 1995, Widescreen)"
    assert body["title_guess"] == "Heat"
    assert body["match"] is None


def test_lookup_rejects_bad_barcode(client, auth_headers):
    response = client.get("/api/movies/barcode/085391163429", headers=auth_headers)
    assert response.status_code == 422


def test_lookup_requires_login(client):
    assert client.get(f"/api/movies/barcode/{HEAT_UPC}").status_code == 401


def test_lookup_rate_limited(client, auth_headers, monkeypatch):
    def rate_limited(barcode: str):
        raise barcodes.BarcodeRateLimitedError("used up")

    monkeypatch.setattr(barcodes, "lookup_product_title", rate_limited)
    response = client.get(f"/api/movies/barcode/{HEAT_UPC}", headers=auth_headers)
    assert response.status_code == 429


def test_scanned_disc_is_recognised_from_own_shelf(client, auth_headers, monkeypatch):
    added = client.post(
        "/api/inventory",
        json={"title": "Heat", "tmdb_id": 949, "barcode": HEAT_UPC},
        headers=auth_headers,
    )
    assert added.status_code == 201
    assert added.json()["barcode"] == HEAT_EAN

    def must_not_call(barcode: str):
        raise AssertionError("should not look up a barcode already on the shelf")

    monkeypatch.setattr(barcodes, "lookup_product_title", must_not_call)
    body = client.get(f"/api/movies/barcode/{HEAT_EAN}", headers=auth_headers).json()
    assert body["owned_count"] == 1
    assert body["match"]["title"] == "Heat"
    assert body["match"]["tmdb_id"] == 949

    # Another user's shelf is not consulted.
    other = register_and_login(client, "other@example.com")
    monkeypatch.setattr(barcodes, "lookup_product_title", lambda barcode: None)
    body = client.get(f"/api/movies/barcode/{HEAT_EAN}", headers=other).json()
    assert body["owned_count"] == 0
    assert body["match"] is None


def test_inventory_search_by_barcode(client, auth_headers):
    client.post("/api/inventory", json={"title": "Heat", "barcode": HEAT_EAN}, headers=auth_headers)
    client.post("/api/inventory", json={"title": "Alien"}, headers=auth_headers)
    page = client.get("/api/inventory", params={"q": HEAT_UPC}, headers=auth_headers).json()
    assert [item["movie"]["title"] for item in page["items"]] == ["Heat"]


def test_add_rejects_bad_barcode(client, auth_headers):
    response = client.post(
        "/api/inventory", json={"title": "Heat", "barcode": "123"}, headers=auth_headers
    )
    assert response.status_code == 422


def test_upgrade_schema_from_first_release(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as conn:
        # The tables as the first release created them.
        conn.execute(
            text(
                "CREATE TABLE movies (id INTEGER PRIMARY KEY, tmdb_id INTEGER, title VARCHAR(255), "
                "year INTEGER, poster_url VARCHAR(500), genres JSON, runtime INTEGER)"
            )
        )
        conn.execute(text("CREATE UNIQUE INDEX ix_movies_tmdb_id ON movies (tmdb_id)"))
        conn.execute(
            text(
                "CREATE TABLE inventory_items (id INTEGER PRIMARY KEY, user_id INTEGER, "
                "movie_id INTEGER, condition VARCHAR(50), location VARCHAR(100), notes TEXT, "
                "added_at DATETIME)"
            )
        )
        conn.execute(text("INSERT INTO movies (id, tmdb_id, title) VALUES (1, 949, 'Heat')"))

    upgrade_schema(engine)
    upgrade_schema(engine)  # A second run changes nothing.

    inspector = inspect(engine)
    indexes = {index["name"]: index for index in inspector.get_indexes("movies")}
    assert not indexes["ix_movies_tmdb_id"]["unique"]
    assert indexes["uq_movies_media_tmdb"]["unique"]
    assert "barcode" in {c["name"] for c in inspector.get_columns("inventory_items")}
    with engine.begin() as conn:
        assert conn.execute(text("SELECT media_type FROM movies")).scalar_one() == "movie"
        # A TV show can now share Heat's TMDB id.
        conn.execute(
            text("INSERT INTO movies (tmdb_id, title, media_type) VALUES (949, 'Show', 'tv')")
        )
