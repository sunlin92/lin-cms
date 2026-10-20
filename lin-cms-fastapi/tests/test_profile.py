"""个人资料：信息查询、更新、改密、权限清单。"""


def test_get_information(client, root_headers):
    rv = client.get("/cms/user/information", headers=root_headers)
    assert rv.status_code == 200
    assert rv.json()["username"] == "root"


def test_update_own_nickname(client, root_headers):
    rv = client.put("/cms/user", headers=root_headers, json={"nickname": "rooter"})
    assert rv.status_code == 200
    assert rv.json()["code"] == 0
    rv = client.get("/cms/user/information", headers=root_headers)
    assert rv.json()["nickname"] == "rooter"


def test_update_own_info_with_invalid_nickname(client, root_headers):
    rv = client.put("/cms/user", headers=root_headers, json={"nickname": "x"})
    assert rv.status_code == 400


def test_get_allowed_permissions(client, root_headers):
    rv = client.get("/cms/user/permissions", headers=root_headers)
    assert rv.status_code == 200
    data = rv.json()
    assert data["admin"] is True
    assert isinstance(data["permissions"], list)
    assert "id" in data and "username" in data


def test_change_password_mismatch(client, guest_headers):
    rv = client.put(
        "/cms/user/change_password",
        headers=guest_headers,
        json={"old_password": "123456x", "new_password": "abcd1234", "confirm_password": "different"},
    )
    assert rv.status_code == 400


def test_change_password_wrong_old_password(client, guest_headers):
    rv = client.put(
        "/cms/user/change_password",
        headers=guest_headers,
        json={"old_password": "totally-wrong", "new_password": "NewPass123", "confirm_password": "NewPass123"},
    )
    assert rv.status_code != 200
    assert rv.json()["code"] != 0
