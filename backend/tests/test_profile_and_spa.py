from fastapi.testclient import TestClient
from starlette.routing import Mount

from app.main import SinglePageApp, app


def test_profile_for_empty_collection(client, auth_headers):
    body = client.get("/api/inventory/profile", headers=auth_headers).json()
    assert body["email"] == "uros@example.com"
    assert body["total_discs"] == 0
    assert body["films"] == body["tv_shows"] == body["film_minutes"] == 0
    assert body["genres"] == body["decades"] == []
    assert body["film_titles"] == body["tv_titles"] == []


def test_profile_breaks_down_the_collection(client, auth_headers):
    for item in [
        {"title": "The Matrix", "tmdb_id": 603},
        {"title": "The Matrix", "tmdb_id": 603},  # a second copy
        {"title": "Heat", "tmdb_id": 949},
        {"title": "x", "tmdb_id": 949, "media_type": "tv"},
        {"title": "Home video"},
    ]:
        assert client.post("/api/inventory", json=item, headers=auth_headers).status_code == 201

    body = client.get("/api/inventory/profile", headers=auth_headers).json()
    assert body["total_discs"] == 5
    assert body["films"] == 3
    assert body["tv_shows"] == 1
    # Each film counted once, however many copies: 136 + 170. TV runtimes are left out.
    assert body["film_minutes"] == 306
    assert body["genres"][0] == {"name": "Action", "count": 2}
    assert {"name": "Animation", "count": 1} in body["genres"]
    assert body["decades"] == [{"name": "1990s", "count": 2}, {"name": "2000s", "count": 1}]
    assert [(t["title"], t["copies"]) for t in body["film_titles"]] == [
        ("Heat", 1),
        ("Home video", 1),
        ("The Matrix", 2),
    ]
    assert [t["title"] for t in body["tv_titles"]] == ["The Matrix Chronicles"]

    stats = client.get("/api/inventory/stats", headers=auth_headers).json()
    assert (stats["total"], stats["films"], stats["tv_shows"]) == (5, 4, 1)


def test_profile_requires_login(client):
    assert client.get("/api/inventory/profile").status_code == 401


def test_frontend_routes_fall_back_to_index(tmp_path):
    (tmp_path / "index.html").write_text("<p>app</p>")
    (tmp_path / "app.js").write_text("js")
    app.router.routes.append(Mount("/", SinglePageApp(directory=tmp_path, html=True)))
    try:
        web = TestClient(app)
        assert web.get("/").text == "<p>app</p>"
        assert web.get("/dashboard/profile").text == "<p>app</p>"
        assert web.get("/app.js").text == "js"
        assert web.get("/missing.js").status_code == 404
        assert web.get("/api/nope").status_code == 404
    finally:
        app.router.routes.pop()


def test_item_details_from_tmdb(client, auth_headers):
    item = client.post(
        "/api/inventory",
        json={"title": "The Matrix", "tmdb_id": 603, "location": "Shelf A"},
        headers=auth_headers,
    ).json()
    body = client.get(f"/api/inventory/{item['id']}", headers=auth_headers).json()
    assert body["item"]["location"] == "Shelf A"
    assert body["item"]["movie"]["title"] == "The Matrix"
    assert body["details"]["overview"] == "About The Matrix."
    assert body["details"]["cast"] == [
        {"name": "Keanu Reeves", "character": "Neo", "photo_url": None}
    ]
    assert body["details"]["crew_label"] == "Directed by"
    assert body["details_error"] is None


def test_item_details_for_hand_typed_title(client, auth_headers):
    item = client.post("/api/inventory", json={"title": "Home video"}, headers=auth_headers).json()
    body = client.get(f"/api/inventory/{item['id']}", headers=auth_headers).json()
    assert body["details"] is None
    assert body["details_error"] is None


def test_item_details_when_tmdb_fails(client, auth_headers, monkeypatch):
    from app import tmdb

    item = client.post(
        "/api/inventory", json={"title": "Heat", "tmdb_id": 949}, headers=auth_headers
    ).json()

    def broken(tmdb_id, media_type="movie"):
        raise tmdb.TmdbError("down")

    monkeypatch.setattr(tmdb, "get_details", broken)
    body = client.get(f"/api/inventory/{item['id']}", headers=auth_headers).json()
    assert body["item"]["movie"]["title"] == "Heat"
    assert body["details"] is None
    assert "TMDB" in body["details_error"]


def test_item_details_are_private(client, auth_headers):
    from tests.conftest import register_and_login

    item = client.post("/api/inventory", json={"title": "Se7en"}, headers=auth_headers).json()
    other = register_and_login(client, "other@example.com")
    assert client.get(f"/api/inventory/{item['id']}", headers=other).status_code == 404
