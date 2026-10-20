"""管理员：用户分页、注册/删除/更新/重置密码及保护规则。"""

from tests.conftest import find_user_id


def _register(client, headers, username, password="123456x", email=None, group_ids=None):
    payload = {
        "username": username,
        "password": password,
        "confirm_password": password,
        "group_ids": group_ids if group_ids is not None else [],
    }
    if email:
        payload["email"] = email
    return client.post("/cms/user/register", headers=headers, json=payload)


def test_list_permissions_grouped(client, root_headers):
    rv = client.get("/cms/admin/permission", headers=root_headers)
    assert rv.status_code == 200
    data = rv.json()
    assert "日志" in data
    assert "图书" in data
    assert {"id", "name", "module", "mount"} <= set(data["日志"][0])


def test_admin_users_page(client, root_headers):
    rv = client.get("/cms/admin/users", headers=root_headers)
    assert rv.status_code == 200
    data = rv.json()
    assert {"items", "count", "page", "total", "total_page"} <= set(data)
    usernames = [item["username"] for item in data["items"]]
    assert "root" not in usernames
    assert "tester" in usernames
    tester = next(item for item in data["items"] if item["username"] == "tester")
    assert tester["groups"][0]["name"] == "Guest"


def test_admin_users_requires_admin(client, guest_headers):
    rv = client.get("/cms/admin/users", headers=guest_headers)
    assert rv.status_code == 401


def test_register_and_delete_user(client, root_headers):
    rv = _register(client, root_headers, "newbie", email="newbie@example.com")
    assert rv.status_code == 200
    assert rv.json()["code"] == 0

    rv = client.post("/cms/user/login", json={"username": "newbie", "password": "123456x"})
    assert rv.status_code == 200

    uid = find_user_id(client, root_headers, "newbie")
    rv = client.delete(f"/cms/admin/user/{uid}", headers=root_headers)
    assert rv.status_code == 200

    rv = client.post("/cms/user/login", json={"username": "newbie", "password": "123456x"})
    assert rv.status_code == 404


def test_register_duplicate_username(client, root_headers):
    _register(client, root_headers, "dupuser")
    rv = _register(client, root_headers, "dupuser")
    assert rv.status_code == 400
    assert rv.json()["code"] == 10060
    uid = find_user_id(client, root_headers, "dupuser")
    assert client.delete(f"/cms/admin/user/{uid}", headers=root_headers).status_code == 200


def test_register_password_mismatch(client, root_headers):
    rv = client.post(
        "/cms/user/register",
        headers=root_headers,
        json={
            "username": "badpwd",
            "password": "123456x",
            "confirm_password": "654321x",
            "group_ids": [],
        },
    )
    assert rv.status_code == 400


def test_admin_change_user_password(client, root_headers):
    _register(client, root_headers, "pwuser", password="abcdef12")
    uid = find_user_id(client, root_headers, "pwuser")
    rv = client.put(
        f"/cms/admin/user/{uid}/password",
        headers=root_headers,
        json={"new_password": "xyz98765", "confirm_password": "xyz98765"},
    )
    assert rv.status_code == 200
    rv = client.post("/cms/user/login", json={"username": "pwuser", "password": "xyz98765"})
    assert rv.status_code == 200


def test_admin_delete_missing_user(client, root_headers):
    rv = client.delete("/cms/admin/user/99999", headers=root_headers)
    assert rv.status_code == 404


def test_admin_cannot_delete_root(client, root_headers):
    rv = client.delete("/cms/admin/user/1", headers=root_headers)
    assert rv.status_code == 401


def test_admin_update_user_email(client, root_headers):
    _register(client, root_headers, "mailuser", email="mailuser@example.com")
    uid = find_user_id(client, root_headers, "mailuser")
    rv = client.put(
        f"/cms/admin/user/{uid}",
        headers=root_headers,
        json={"email": "newmail@example.com", "group_ids": []},
    )
    assert rv.status_code == 200


def test_register_without_groups_lands_in_guest(client, root_headers):
    rv = _register(client, root_headers, "fbguest1", password="Abcd1234")
    assert rv.status_code == 200, rv.text
    rv = client.get("/cms/admin/users", headers=root_headers, params={"count": 15, "group_id": 2})
    items = rv.json()["items"]
    assert any(u["username"] == "fbguest1" for u in items), items
    uid = find_user_id(client, root_headers, "fbguest1")
    client.delete(f"/cms/admin/user/{uid}", headers=root_headers)


def test_register_rejects_under_6_chars(client, root_headers):
    rv = _register(client, root_headers, "tooshort", password="12345")
    assert rv.status_code == 400


def test_register_forbids_root_group(client, root_headers):
    root_gid = 1  # 种子顺序 Root=1
    rv = _register(client, root_headers, "rootadd", group_ids=[root_gid])
    assert rv.status_code == 401
    assert rv.json()["code"] == 10073


def test_register_rejects_missing_group(client, root_headers):
    rv = _register(client, root_headers, "ghostgrp", group_ids=[99999])
    assert rv.status_code == 401
    assert rv.json()["code"] == 10077


def test_admin_cannot_change_root_user_groups(client, root_headers):
    rv = client.put(
        "/cms/admin/user/1",
        headers=root_headers,
        json={"email": "root@example.com", "group_ids": [2]},
    )
    assert rv.status_code == 401
    assert rv.json()["code"] == 10078


def test_delete_user_cleans_associations(app, client, root_headers):
    _register(client, root_headers, "cleanuser")
    uid = find_user_id(client, root_headers, "cleanuser")
    assert client.delete(f"/cms/admin/user/{uid}", headers=root_headers).status_code == 200
    from app.models import UserGroup, UserIdentity

    with app.state.sessionmaker() as db:
        assert db.query(UserGroup).filter(UserGroup.user_id == uid).count() == 0
        assert db.query(UserIdentity).filter(UserIdentity.user_id == uid).count() == 0


def test_username_reusable_after_delete(client, root_headers):
    _register(client, root_headers, "reuseme", password="Reuse1234")
    uid = find_user_id(client, root_headers, "reuseme")
    assert client.delete(f"/cms/admin/user/{uid}", headers=root_headers).status_code == 200
    rv = _register(client, root_headers, "reuseme", password="Reuse5678")
    assert rv.status_code == 200
    rv = client.post("/cms/user/login", json={"username": "reuseme", "password": "Reuse5678"})
    assert rv.status_code == 200
