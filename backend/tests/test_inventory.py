from tests.conftest import register_and_login


def test_inventory_requires_login(client):
    assert client.get("/api/inventory").status_code == 401


def test_add_list_update_delete(client, auth_headers):
    response = client.post(
        "/api/inventory",
        json={"title": "The Matrix", "year": 1999, "condition": "good"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    item = response.json()
    assert item["movie"]["title"] == "The Matrix"

    page = client.get("/api/inventory", headers=auth_headers).json()
    assert page["total"] == 1
    assert page["items"][0]["id"] == item["id"]

    response = client.patch(
        f"/api/inventory/{item['id']}", json={"location": "Shelf A"}, headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["location"] == "Shelf A"
    assert response.json()["condition"] == "good"

    assert client.delete(f"/api/inventory/{item['id']}", headers=auth_headers).status_code == 204
    assert client.get("/api/inventory", headers=auth_headers).json()["total"] == 0


def test_search_and_pagination(client, auth_headers):
    for title in ["Alien", "Aliens", "Heat"]:
        client.post("/api/inventory", json={"title": title}, headers=auth_headers)

    page = client.get("/api/inventory", params={"q": "alien"}, headers=auth_headers).json()
    assert page["total"] == 2

    page = client.get("/api/inventory", params={"limit": 2}, headers=auth_headers).json()
    assert page["total"] == 3
    assert len(page["items"]) == 2


def test_same_film_shares_one_movie_row(client, auth_headers):
    first = client.post(
        "/api/inventory", json={"title": "Heat", "year": 1995}, headers=auth_headers
    ).json()
    second = client.post(
        "/api/inventory", json={"title": "heat", "year": 1995}, headers=auth_headers
    ).json()
    assert first["movie"]["id"] == second["movie"]["id"]
    assert first["id"] != second["id"]


def test_users_cannot_see_or_change_each_others_items(client, auth_headers):
    item = client.post("/api/inventory", json={"title": "Se7en"}, headers=auth_headers).json()
    other = register_and_login(client, "other@example.com")

    assert client.get("/api/inventory", headers=other).json()["total"] == 0
    assert client.delete(f"/api/inventory/{item['id']}", headers=other).status_code == 404
    response = client.patch(f"/api/inventory/{item['id']}", json={"notes": "mine"}, headers=other)
    assert response.status_code == 404
