from app import tmdb


def test_movie_search(client, auth_headers):
    response = client.get("/api/movies/search", params={"q": "matrix"}, headers=auth_headers)
    assert response.status_code == 200
    assert [(t["media_type"], t["tmdb_id"]) for t in response.json()] == [
        ("movie", 603),
        ("tv", 949),
    ]


def test_movie_search_requires_login(client):
    assert client.get("/api/movies/search", params={"q": "matrix"}).status_code == 401


def test_movie_search_without_api_key(client, auth_headers, monkeypatch):
    def not_configured(query: str, limit: int = 10):
        raise tmdb.TmdbNotConfiguredError("TMDB_API_KEY is not configured")

    monkeypatch.setattr(tmdb, "search_titles", not_configured)
    response = client.get("/api/movies/search", params={"q": "matrix"}, headers=auth_headers)
    assert response.status_code == 503


def test_add_from_tmdb_uses_tmdb_details(client, auth_headers):
    response = client.post(
        "/api/inventory", json={"title": "wrong title", "tmdb_id": 603}, headers=auth_headers
    )
    assert response.status_code == 201
    movie = response.json()["movie"]
    assert movie["title"] == "The Matrix"
    assert movie["year"] == 1999
    assert movie["genres"] == ["Action", "Science Fiction"]
    assert movie["runtime"] == 136


def test_add_tv_show_with_id_shared_by_a_film(client, auth_headers):
    film = client.post(
        "/api/inventory", json={"title": "Heat", "tmdb_id": 949}, headers=auth_headers
    ).json()
    show = client.post(
        "/api/inventory",
        json={"title": "x", "tmdb_id": 949, "media_type": "tv"},
        headers=auth_headers,
    ).json()
    assert film["movie"]["media_type"] == "movie"
    assert film["movie"]["title"] == "Heat"
    assert show["movie"]["media_type"] == "tv"
    assert show["movie"]["title"] == "The Matrix Chronicles"
    assert show["movie"]["runtime"] == 22
    assert film["movie"]["id"] != show["movie"]["id"]

    again = client.post(
        "/api/inventory",
        json={"title": "x", "tmdb_id": 949, "media_type": "tv"},
        headers=auth_headers,
    ).json()
    assert again["movie"]["id"] == show["movie"]["id"]


def test_add_rejects_unknown_media_type(client, auth_headers):
    response = client.post(
        "/api/inventory", json={"title": "x", "media_type": "podcast"}, headers=auth_headers
    )
    assert response.status_code == 422


def test_add_from_tmdb_falls_back_when_tmdb_fails(client, auth_headers):
    response = client.post(
        "/api/inventory",
        json={"title": "Unknown Film", "year": 2001, "tmdb_id": 999999},
        headers=auth_headers,
    )
    assert response.status_code == 201
    movie = response.json()["movie"]
    assert movie["title"] == "Unknown Film"
    assert movie["genres"] == []


def test_stats_for_empty_collection(client, auth_headers):
    assert client.get("/api/inventory/stats", headers=auth_headers).json() == {
        "total": 0,
        "added_this_month": 0,
        "top_genre": None,
        "oldest": None,
        "newest": None,
    }


def test_stats(client, auth_headers):
    for film in [
        {"title": "The Matrix", "tmdb_id": 603},
        {"title": "Heat", "tmdb_id": 949},
        {"title": "Home video"},
    ]:
        assert client.post("/api/inventory", json=film, headers=auth_headers).status_code == 201

    stats = client.get("/api/inventory/stats", headers=auth_headers).json()
    assert stats["total"] == 3
    assert stats["added_this_month"] == 3
    assert stats["top_genre"] == "Action"
    assert stats["oldest"] == {"title": "Heat", "year": 1995}
    assert stats["newest"] == {"title": "The Matrix", "year": 1999}
