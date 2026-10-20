"""分组内容权限 API 与权限同步隔离测试（docs/05 Task 5，规格 §5.1.1/§4.1）。"""

import pytest

from app.core.permissions import PERMISSION_REGISTRY, sync_permissions
from app.models import GroupContentPermission


def _create_type(client, root_headers, key: str) -> int:
    rv = client.post(
        "/api/v1/admin/content-types",
        headers=root_headers,
        json={
            "key": key,
            "name": key,
            "fields": [{"key": "title", "label": "标题", "type": "text", "required": True}],
        },
    )
    assert rv.status_code == 200, rv.text
    rv = client.get("/api/v1/admin/content-types", headers=root_headers, params={"count": 15})
    return next(i["id"] for i in rv.json()["items"] if i["key"] == key)


def _guest_group_id(client, root_headers) -> int:
    # Guest 组 id：通过把某用户分组接口或直接查询；这里用 root 会话查库不可行——
    # 使用 admin group all 接口（不含 Root，但含 Guest）
    rv = client.get("/cms/admin/group/all", headers=root_headers)
    return next(g["id"] for g in rv.json() if g["name"] == "Guest")


def test_full_replace_semantics(client, root_headers):
    t1 = _create_type(client, root_headers, "perm-type-1")
    t2 = _create_type(client, root_headers, "perm-type-2")
    gid = _guest_group_id(client, root_headers)
    # 第一次 PUT：两个类型授权
    rv = client.put(
        f"/api/v1/admin/groups/{gid}/content-permissions",
        headers=root_headers,
        json={
            "entries": [
                {"content_type_id": t1, "can_read": True, "can_create": True},
                {"content_type_id": t2, "can_read": True, "can_update": True, "can_delete": True},
            ]
        },
    )
    assert rv.status_code == 200, rv.text
    # GET 返回一致
    rv = client.get(f"/api/v1/admin/groups/{gid}/content-permissions", headers=root_headers)
    entries = rv.json()["entries"]
    assert {(e["content_type_id"], e["can_read"], e["can_create"]) for e in entries} == {
        (t1, True, True),
        (t2, True, False),
    }
    # 再 PUT 只留 t1 → 遗漏即撤销
    rv = client.put(
        f"/api/v1/admin/groups/{gid}/content-permissions",
        headers=root_headers,
        json={"entries": [{"content_type_id": t1, "can_read": True}]},
    )
    assert rv.status_code == 200
    rv = client.get(f"/api/v1/admin/groups/{gid}/content-permissions", headers=root_headers)
    entries = rv.json()["entries"]
    assert len(entries) == 1 and entries[0]["content_type_id"] == t1 and entries[0]["can_create"] is False


def test_root_hidden_group_grantable(client, root_headers):
    """隐藏的 ROOT 组也可配置内容 ACL（规格 §5.1.1）。"""
    # Root 组 id=1（种子）；通过 PUT/GET 验证
    t1 = _create_type(client, root_headers, "perm-type-root")
    rv = client.put(
        "/api/v1/admin/groups/1/content-permissions",
        headers=root_headers,
        json={"entries": [{"content_type_id": t1, "can_read": True}]},
    )
    assert rv.status_code == 200, rv.text
    rv = client.get("/api/v1/admin/groups/1/content-permissions", headers=root_headers)
    assert rv.status_code == 200
    assert rv.json()["entries"][0]["content_type_id"] == t1


def test_group_content_permissions_require_root(client, guest_headers):
    rv = client.get("/api/v1/admin/groups/2/content-permissions", headers=guest_headers)
    assert rv.status_code in (401, 403)
    rv = client.put("/api/v1/admin/groups/2/content-permissions", headers=guest_headers, json={"entries": []})
    assert rv.status_code in (401, 403)
    rv = client.get("/api/v1/admin/groups/2/content-permissions")
    assert rv.status_code == 401


def test_put_unknown_group_rejected(client, root_headers):
    rv = client.put(
        "/api/v1/admin/groups/99999/content-permissions",
        headers=root_headers,
        json={"entries": []},
    )
    assert rv.status_code == 404
    rv = client.get("/api/v1/admin/groups/99999/content-permissions", headers=root_headers)
    assert rv.status_code == 404


def test_sync_permissions_never_touches_dynamic_grants(client, root_headers, app):
    t1 = _create_type(client, root_headers, "perm-type-sync")
    gid = _guest_group_id(client, root_headers)
    rv = client.put(
        f"/api/v1/admin/groups/{gid}/content-permissions",
        headers=root_headers,
        json={"entries": [{"content_type_id": t1, "can_read": True}]},
    )
    assert rv.status_code == 200

    def _snapshot() -> list[tuple]:
        with app.state.sessionmaker() as db:
            rows = db.query(GroupContentPermission).order_by(GroupContentPermission.id).all()
            return [(r.group_id, r.content_type_id, r.can_read, r.can_create, r.can_update, r.can_delete) for r in rows]

    before = _snapshot()
    assert before, "前置：已存在动态授权"

    # 常规再同步
    with app.state.sessionmaker() as db:
        sync_permissions(db)
        db.commit()
    assert _snapshot() == before

    # 模拟代码权限集合变化（删掉最后一个注册项）后再同步：固定权限被清理，动态授权不动
    removed = PERMISSION_REGISTRY.pop()
    try:
        with app.state.sessionmaker() as db:
            sync_permissions(db)
            db.commit()
    finally:
        PERMISSION_REGISTRY.append(removed)
    assert _snapshot() == before


@pytest.fixture()
def _noop():
    return None
