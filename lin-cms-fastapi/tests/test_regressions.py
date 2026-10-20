"""回归：验证码垃圾 tag、行为日志、OpenAPI 导出、根路径 404。"""


def test_login_captcha_garbage_tag_rejected():
    from fastapi.testclient import TestClient

    from tests.conftest import make_app

    app = make_app(login_captcha=True)
    with TestClient(app) as client:
        rv = client.post(
            "/cms/user/login",
            headers={"tag": "garbage-not-a-jwt"},
            json={"username": "root", "password": "123456"},
        )
        assert rv.status_code != 500
        assert "验证码校验失败" in rv.json().get("message", "")


def test_behavior_logs_written(app, client, root_headers):
    from tests.conftest import find_user_id

    _register(client, root_headers, "loguser")
    uid = find_user_id(client, root_headers, "loguser")
    client.delete(f"/cms/admin/user/{uid}", headers=root_headers)

    rv = client.get("/cms/log/search", headers=root_headers, params={"keyword": "管理员"})
    messages = [item["message"] for item in rv.json()["items"]]
    assert any("新建了一个用户" in m for m in messages)
    assert any("删除了一个用户" in m for m in messages)


def _register(client, headers, username):
    return client.post(
        "/cms/user/register",
        headers=headers,
        json={"username": username, "password": "Abcd1234", "confirm_password": "Abcd1234", "group_ids": []},
    )


def test_group_logs_written(client, root_headers):
    client.post("/cms/admin/group", headers=root_headers, json={"name": "loggroup", "info": "", "permission_ids": []})
    rv = client.get("/cms/log/search", headers=root_headers, params={"keyword": "分组"})
    messages = [item["message"] for item in rv.json()["items"]]
    assert any("新建了一个分组" in m for m in messages)


def test_openapi_document(client):
    rv = client.get("/openapi.json")
    assert rv.status_code == 200
    spec = rv.json()
    assert spec["openapi"].startswith("3.")
    assert "/cms/user/login" in spec["paths"]


def test_unknown_route_404_envelope(client):
    rv = client.get("/nope/nothing")
    assert rv.status_code == 404
    body = rv.json()
    assert {"message", "code", "request"} <= set(body)
    assert body["request"].startswith("GET  ")


def test_method_not_allowed(client):
    rv = client.delete("/health")
    assert rv.status_code == 405
    assert rv.json()["code"] == 10080
