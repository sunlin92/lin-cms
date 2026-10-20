"""管理员：分组 CRUD 与内置分组保护。"""


def test_group_crud(client, root_headers):
    payload = {"name": "crud-group", "info": "临时分组", "permission_ids": []}
    rv = client.post("/cms/admin/group", headers=root_headers, json=payload)
    assert rv.status_code == 200

    rv = client.post("/cms/admin/group", headers=root_headers, json=payload)
    assert rv.status_code == 401

    rv = client.get("/cms/admin/group/all", headers=root_headers)
    group = next(g for g in rv.json() if g["name"] == "crud-group")
    gid = group["id"]

    rv = client.get(f"/cms/admin/group/{gid}", headers=root_headers)
    assert rv.status_code == 200
    assert rv.json()["permissions"] == []

    rv = client.put(f"/cms/admin/group/{gid}", headers=root_headers, json={"name": "crud-group-2", "info": "改名"})
    assert rv.status_code == 200

    rv = client.delete(f"/cms/admin/group/{gid}", headers=root_headers)
    assert rv.status_code == 200

    rv = client.get(f"/cms/admin/group/{gid}", headers=root_headers)
    assert rv.status_code == 404


def test_group_all_excludes_root(client, root_headers):
    rv = client.get("/cms/admin/group/all", headers=root_headers)
    assert rv.status_code == 200
    names = [g["name"] for g in rv.json()]
    assert "Root" not in names
    assert "Guest" in names


def test_cannot_delete_builtin_groups(client, root_headers):
    rv = client.get("/cms/admin/group/all", headers=root_headers)
    guest_gid = next(g for g in rv.json() if g["name"] == "Guest")["id"]
    rv = client.delete(f"/cms/admin/group/{guest_gid}", headers=root_headers)
    assert rv.status_code == 401


def test_cannot_delete_group_with_users(client, root_headers):
    rv = client.post(
        "/cms/admin/group", headers=root_headers, json={"name": "has-users", "info": "", "permission_ids": []}
    )
    assert rv.status_code == 200
    rv = client.get("/cms/admin/group/all", headers=root_headers)
    gid = next(g for g in rv.json() if g["name"] == "has-users")["id"]

    client.post(
        "/cms/user/register",
        headers=root_headers,
        json={"username": "groupusr", "password": "Abcd1234", "confirm_password": "Abcd1234", "group_ids": [gid]},
    )
    rv = client.delete(f"/cms/admin/group/{gid}", headers=root_headers)
    assert rv.status_code == 401

    # 清理：把用户挪回 Guest 再删组
    from tests.conftest import find_user_id

    uid = find_user_id(client, root_headers, "groupusr")
    client.put(f"/cms/admin/user/{uid}", headers=root_headers, json={"email": "", "group_ids": []})
    client.delete(f"/cms/admin/user/{uid}", headers=root_headers)
    assert client.delete(f"/cms/admin/group/{gid}", headers=root_headers).status_code == 200
