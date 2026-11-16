from tests.conftest import register_and_login


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_register_login_and_me(client):
    headers = register_and_login(client, "Someone@Example.com")
    response = client.get("/api/auth/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["email"] == "someone@example.com"


def test_register_duplicate_email(client):
    register_and_login(client, "dup@example.com")
    response = client.post(
        "/api/auth/register", json={"email": "dup@example.com", "password": "another-pass"}
    )
    assert response.status_code == 409


def test_register_rejects_short_password(client):
    response = client.post(
        "/api/auth/register", json={"email": "short@example.com", "password": "abc"}
    )
    assert response.status_code == 422


def test_login_wrong_password(client):
    register_and_login(client, "wrong@example.com")
    response = client.post(
        "/api/auth/login", data={"username": "wrong@example.com", "password": "not-the-password"}
    )
    assert response.status_code == 401


def test_me_requires_valid_token(client):
    assert client.get("/api/auth/me").status_code == 401
    bad = {"Authorization": "Bearer not-a-real-token"}
    assert client.get("/api/auth/me", headers=bad).status_code == 401
