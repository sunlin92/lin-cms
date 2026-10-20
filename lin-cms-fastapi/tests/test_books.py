"""图书 CRUD：公开查询/搜索、登录增改、权限删除、软删除。"""

from tests.conftest import BOOK_PAYLOAD


def test_book_crud_flow(client, root_headers, guest_headers):
    rv = client.post("/v1/book", headers=root_headers, json=BOOK_PAYLOAD)
    assert rv.status_code == 200
    assert rv.json()["code"] == 12

    rv = client.get("/v1/book")
    assert rv.status_code == 200
    book = next(b for b in rv.json() if b["title"] == BOOK_PAYLOAD["title"] and b["author"] == BOOK_PAYLOAD["author"])
    bid = book["id"]

    rv = client.get(f"/v1/book/{bid}")
    assert rv.status_code == 200
    assert rv.json()["author"] == BOOK_PAYLOAD["author"]

    rv = client.get("/v1/book/search", params={"q": "测试驱动"})
    assert rv.status_code == 200
    assert any(b["id"] == bid for b in rv.json())

    rv = client.put(f"/v1/book/{bid}", headers=root_headers, json={**BOOK_PAYLOAD, "title": "重构"})
    assert rv.status_code == 200
    assert client.get(f"/v1/book/{bid}").json()["title"] == "重构"

    rv = client.delete(f"/v1/book/{bid}", headers=guest_headers)
    assert rv.status_code == 401

    rv = client.delete(f"/v1/book/{bid}", headers=root_headers)
    assert rv.status_code == 200
    assert rv.json()["code"] == 14

    rv = client.get(f"/v1/book/{bid}")
    assert rv.status_code == 404


def test_book_create_requires_login(client):
    rv = client.post("/v1/book", json=BOOK_PAYLOAD)
    assert rv.status_code == 401


def test_book_missing_404(client):
    rv = client.get("/v1/book/99999")
    assert rv.status_code == 404
    assert rv.json()["code"] == 10021


def test_book_delete_twice_404(client, root_headers):
    rv = client.post("/v1/book", headers=root_headers, json={**BOOK_PAYLOAD, "title": "一次性书"})
    assert rv.status_code == 200
    book = next(b for b in client.get("/v1/book").json() if b["title"] == "一次性书")
    assert client.delete(f"/v1/book/{book['id']}", headers=root_headers).status_code == 200
    assert client.delete(f"/v1/book/{book['id']}", headers=root_headers).status_code == 404
