"""认证：登录成功/失败、参数校验、令牌刷新、验证码（关闭态）。"""


def test_login_success(client):
    rv = client.post("/cms/user/login", json={"username": "root", "password": "123456"})
    assert rv.status_code == 200
    data = rv.json()
    assert data["access_token"]
    assert data["refresh_token"]


def test_login_wrong_password(client):
    rv = client.post("/cms/user/login", json={"username": "root", "password": "wrong-password"})
    assert rv.status_code == 400
    assert rv.json()["code"] == 10030


def test_login_unknown_user(client):
    rv = client.post("/cms/user/login", json={"username": "nobody", "password": "123456"})
    assert rv.status_code == 404
    assert rv.json()["code"] == 10021


def test_login_missing_fields_rejected(client):
    rv = client.post("/cms/user/login", json={})
    assert rv.status_code == 400
    assert rv.json()["code"] == 10030


def test_protected_endpoint_without_token(client):
    rv = client.get("/cms/user/information")
    assert rv.status_code == 401


def test_refresh_token_roundtrip(client, root_auth):
    rv = client.get("/cms/user/refresh", headers={"Authorization": "Bearer " + root_auth["refresh_token"]})
    assert rv.status_code == 200
    data = rv.json()
    assert data["access_token"]
    assert data["refresh_token"]


def test_refresh_rejects_access_token(client, root_auth):
    rv = client.get("/cms/user/refresh", headers={"Authorization": "Bearer " + root_auth["access_token"]})
    assert rv.status_code == 400
    assert rv.json()["code"] == 10052


def test_captcha_disabled_returns_empty(client):
    rv = client.get("/cms/user/captcha")
    assert rv.status_code == 200
    assert set(rv.json()) == {"tag", "image"}
    assert rv.json() == {"tag": "", "image": ""}
