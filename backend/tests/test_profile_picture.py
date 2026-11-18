from app.routers.profile import MAX_AVATAR_BYTES, image_type

# Smallest valid headers of each format, padded - enough for the type check.
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
WEBP = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 64


def test_image_type():
    assert image_type(PNG) == "image/png"
    assert image_type(JPEG) == "image/jpeg"
    assert image_type(WEBP) == "image/webp"
    assert image_type(b"GIF89a" + b"\x00" * 10) == "image/gif"
    assert image_type(b"<svg xmlns='http://www.w3.org/2000/svg'/>") is None
    assert image_type(b"%PDF-1.7") is None


def test_bio(client, auth_headers):
    me = client.get("/api/auth/me", headers=auth_headers).json()
    assert me["bio"] is None and me["avatar_url"] is None
    response = client.patch(
        "/api/auth/profile", json={"bio": "  Mostly 80s action and Ghibli.  "}, headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["bio"] == "Mostly 80s action and Ghibli."
    cleared = client.patch("/api/auth/profile", json={"bio": "   "}, headers=auth_headers)
    assert cleared.json()["bio"] is None
    too_long = client.patch("/api/auth/profile", json={"bio": "x" * 301}, headers=auth_headers)
    assert too_long.status_code == 422


def test_upload_replace_and_remove_picture(client, auth_headers):
    first = client.put(
        "/api/auth/avatar", files={"file": ("me.png", PNG, "image/png")}, headers=auth_headers
    )
    assert first.status_code == 200, first.text
    url = first.json()["avatar_url"]
    assert url.startswith("/api/avatars/")

    # Anyone with the (unguessable) link can load it, no login needed - like any <img>.
    picture = client.get(url)
    assert picture.status_code == 200
    assert picture.headers["content-type"] == "image/png"
    assert picture.content == PNG
    assert "immutable" in picture.headers["cache-control"]

    # A new upload gets a new address; the old one stops working.
    second = client.put(
        "/api/auth/avatar", files={"file": ("me.jpg", JPEG, "image/jpeg")}, headers=auth_headers
    )
    new_url = second.json()["avatar_url"]
    assert new_url != url
    assert client.get(url).status_code == 404
    assert client.get(new_url).headers["content-type"] == "image/jpeg"

    removed = client.delete("/api/auth/avatar", headers=auth_headers)
    assert removed.json()["avatar_url"] is None
    assert client.get(new_url).status_code == 404


def test_picture_must_be_a_real_image_and_not_too_big(client, auth_headers):
    # The file name and declared type are ignored; the bytes decide.
    fake = client.put(
        "/api/auth/avatar",
        files={"file": ("me.png", b"<script>alert(1)</script>", "image/png")},
        headers=auth_headers,
    )
    assert fake.status_code == 415
    big = client.put(
        "/api/auth/avatar",
        files={"file": ("big.png", PNG + b"\x00" * MAX_AVATAR_BYTES, "image/png")},
        headers=auth_headers,
    )
    assert big.status_code == 413


def test_picture_needs_login(client):
    assert client.put("/api/auth/avatar", files={"file": ("me.png", PNG)}).status_code == 401
    assert client.patch("/api/auth/profile", json={"bio": "hi"}).status_code == 401
