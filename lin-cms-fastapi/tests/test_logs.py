"""日志：分页、过滤、关键字转义、记录者清单。root 管理员旁路直接可查。"""


def test_get_logs_page(client, root_headers):
    rv = client.get("/cms/log", headers=root_headers, params={"count": 5, "page": 0})
    assert rv.status_code == 200
    data = rv.json()
    assert {"items", "count", "page", "total", "total_page"} <= set(data)
    assert data["count"] == 5
    assert data["total"] >= 1
    assert {"message", "username", "method", "path"} <= set(data["items"][0])


def test_search_logs_by_keyword(client, root_headers):
    rv = client.get("/cms/log/search", headers=root_headers, params={"keyword": "登录"})
    assert rv.status_code == 200
    assert rv.json()["total"] >= 1


def test_search_logs_by_name(client, root_headers):
    rv = client.get("/cms/log/search", headers=root_headers, params={"name": "root"})
    assert rv.status_code == 200
    assert rv.json()["total"] >= 1
    assert all(item["username"] == "root" for item in rv.json()["items"])


def test_get_logs_filters_by_name(client, root_headers):
    rv = client.get("/cms/log", headers=root_headers, params={"count": 10, "name": "不存在的用户xyz"})
    assert rv.status_code == 200
    body = rv.json()
    assert body["total"] == 0
    assert body["items"] == []
    rv = client.get("/cms/log", headers=root_headers, params={"count": 10})
    assert rv.json()["total"] >= 1


def test_search_logs_escapes_wildcards(client, root_headers):
    rv = client.get("/cms/log/search", headers=root_headers, params={"keyword": "%", "count": 10})
    body = rv.json()
    assert body["total"] == 0 or all("%" in item["message"] for item in body["items"])


def test_log_users(client, root_headers):
    rv = client.get("/cms/log/users", headers=root_headers)
    assert rv.status_code == 200
    usernames = rv.json()["items"]
    assert "root" in usernames


def test_log_requires_permission_for_guest(client, guest_headers):
    rv = client.get("/cms/log", headers=guest_headers)
    assert rv.status_code == 401


def test_invalid_time_format_rejected(client, root_headers):
    rv = client.get("/cms/log", headers=root_headers, params={"start": "not-a-date"})
    assert rv.status_code == 400
