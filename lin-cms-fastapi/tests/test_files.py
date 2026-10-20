"""文件上传：合法、去重、非法扩展名、超数量、超大小。"""

from tests.conftest import make_app


def _client_with(**overrides):
    from fastapi.testclient import TestClient

    app = make_app(**overrides)
    return app, TestClient(app)


def _login(client):
    rv = client.post("/cms/user/login", json={"username": "root", "password": "123456"})
    return {"Authorization": "Bearer " + rv.json()["access_token"]}


def test_upload_single_file():
    app, client = _client_with(upload_dir="data/test-assets")
    with client:
        headers = _login(client)
        rv = client.post("/cms/file", headers=headers, files={"file": ("a.jpg", b"jpeg-bytes-1", "image/jpeg")})
        assert rv.status_code == 200
        items = rv.json()
        assert items[0]["key"] == "file"
        assert items[0]["id"]
        assert items[0]["path"].endswith(".jpg")
        assert "/assets/" in items[0]["url"]


def test_upload_dedupes_by_md5():
    app, client = _client_with(upload_dir="data/test-assets")
    with client:
        headers = _login(client)
        first = client.post(
            "/cms/file", headers=headers, files={"file": ("a.jpg", b"same-content", "image/jpeg")}
        ).json()
        second = client.post(
            "/cms/file", headers=headers, files={"file": ("b.jpg", b"same-content", "image/jpeg")}
        ).json()
        assert first[0]["id"] == second[0]["id"]
        assert first[0]["path"] == second[0]["path"]


def test_upload_rejects_bad_extension():
    app, client = _client_with(upload_dir="data/test-assets")
    with client:
        headers = _login(client)
        rv = client.post("/cms/file", headers=headers, files={"file": ("evil.php", b"<?php", "application/x-php")})
        assert rv.status_code == 401
        assert rv.json()["code"] == 10130


def test_upload_rejects_too_many():
    app, client = _client_with(upload_dir="data/test-assets", upload_max_files=2)
    with client:
        headers = _login(client)
        files = [("files", (f"{i}.jpg", b"x" * 10, "image/jpeg")) for i in range(3)]
        rv = client.post("/cms/file", headers=headers, files=files)
        assert rv.status_code == 413
        assert rv.json()["code"] == 10120


def test_upload_rejects_oversize():
    app, client = _client_with(upload_dir="data/test-assets", upload_single_limit=8)
    with client:
        headers = _login(client)
        rv = client.post("/cms/file", headers=headers, files={"file": ("big.jpg", b"x" * 64, "image/jpeg")})
        assert rv.status_code == 413
        assert rv.json()["code"] == 10110


def test_upload_requires_login():
    app, client = _client_with(upload_dir="data/test-assets")
    with client:
        rv = client.post("/cms/file", files={"file": ("a.jpg", b"xx", "image/jpeg")})
        assert rv.status_code == 401
