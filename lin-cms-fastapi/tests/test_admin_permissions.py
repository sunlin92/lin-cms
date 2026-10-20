"""权限分发与回收：分配后立即生效，回收后立即失权。"""

from tests.conftest import permission_ids_by_module


def test_dispatch_and_remove_permissions(client, root_headers, guest_headers):
    permission_ids = permission_ids_by_module(client, root_headers, "日志")

    rv = client.post(
        "/cms/admin/permission/dispatch/batch",
        headers=root_headers,
        json={"group_id": 2, "permission_ids": permission_ids},
    )
    assert rv.status_code == 200
    assert client.get("/cms/log", headers=guest_headers).status_code == 200

    rv = client.post(
        "/cms/admin/permission/remove",
        headers=root_headers,
        json={"group_id": 2, "permission_ids": permission_ids},
    )
    assert rv.status_code == 200
    assert client.get("/cms/log", headers=guest_headers).status_code == 401


def test_dispatch_is_idempotent(client, root_headers):
    permission_ids = permission_ids_by_module(client, root_headers, "日志")
    for _ in range(2):
        rv = client.post(
            "/cms/admin/permission/dispatch/batch",
            headers=root_headers,
            json={"group_id": 2, "permission_ids": permission_ids},
        )
        assert rv.status_code == 200
    # 清理
    client.post(
        "/cms/admin/permission/remove",
        headers=root_headers,
        json={"group_id": 2, "permission_ids": permission_ids},
    )


def test_remove_nonexistent_is_ok(client, root_headers):
    rv = client.post(
        "/cms/admin/permission/remove",
        headers=root_headers,
        json={"group_id": 2, "permission_ids": []},
    )
    assert rv.status_code == 200
