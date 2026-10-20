"""内容记录服务与 API 测试（docs/05 Task 9，规格 §5.2）。"""

import pytest

from app.models import ContentType, GroupContentPermission, UserGroup
from app.repositories import user_repo
from app.services import agent_token_service

_SEQ = 0

NOTE_FIELDS = [
    {"key": "title", "label": "标题", "type": "text", "required": True, "max_length": 50},
    {"key": "views", "label": "阅读数", "type": "number", "min": 0},
    {"key": "done", "label": "完成", "type": "boolean"},
    {"key": "day", "label": "日期", "type": "date"},
    {"key": "level", "label": "级别", "type": "select", "options": ["low", "high"]},
]


def _prepare(app, *, ops=("read", "create", "update", "delete"), username=None):
    """独立类型 + Guest 授权 + 独立用户（Guest）；返回 (type_key, session_headers, agent_headers, plaintext)。"""
    global _SEQ
    from datetime import datetime

    _SEQ += 1
    tag = f"{datetime.now().timestamp()}-{_SEQ}"
    uname = username or f"rec-{tag}"
    with app.state.sessionmaker() as db:
        from app.schemas.content_type import field_specs_to_json, validate_type_schema

        specs = validate_type_schema(NOTE_FIELDS, max_fields=100)
        ct = ContentType(key=f"note-{tag}", name="笔记", schema_json=field_specs_to_json(specs))
        db.add(ct)
        db.flush()
        flags = {
            "can_read": "read" in ops,
            "can_create": "create" in ops,
            "can_update": "update" in ops,
            "can_delete": "delete" in ops,
        }
        db.add(GroupContentPermission(group_id=2, content_type_id=ct.id, **flags))
        user = user_repo.create_user(db, username=uname)
        user_repo.set_password(db, user, "pass1234x")
        db.add(UserGroup(user_id=user.id, group_id=2))
        db.commit()
        type_key = ct.key
        uid = user.id
    return type_key, uid, uname


def _login(client, username):
    rv = client.post("/cms/user/login", json={"username": username, "password": "pass1234x"})
    assert rv.status_code == 200, rv.text
    return {"Authorization": "Bearer " + rv.json()["access_token"]}


def _agent_token(app, uid, type_key, ops):
    with app.state.sessionmaker() as db:
        ct = db.query(ContentType).filter(ContentType.key == type_key).one()
        result = agent_token_service.create_token(
            db, user_id=uid, name="t", ttl_days=30, scope_entries=[{"content_type_id": ct.id, "ops": ops}]
        )
        db.commit()
    return {"Authorization": "Bearer " + result["token"]}


def _create_note(client, headers, type_key, title="N1", **extra):
    payload = {"title": title, **extra}
    return client.post(f"/api/v1/content/{type_key}", headers=headers, json=payload)


def test_crud_via_session_and_agent(app, client):
    type_key, uid, uname = _prepare(app)
    session_headers = _login(client, uname)
    agent_headers = _agent_token(app, uid, type_key, ["read", "create", "update", "delete"])
    for headers in (session_headers, agent_headers):
        rv = _create_note(client, headers, type_key, title="第一条", views=3, done=False, day="2026-01-01", level="low")
        assert rv.status_code == 200, rv.text
        record = rv.json()
        assert record["title"] == "第一条" and record["views"] == 3.0
        assert "data_json" not in record and "deleted_token" not in record  # 不泄漏内部字段
        rid = record["id"]
        rv = client.get(f"/api/v1/content/{type_key}/{rid}", headers=headers)
        assert rv.status_code == 200 and rv.json()["id"] == rid
        rv = client.patch(f"/api/v1/content/{type_key}/{rid}", headers=headers, json={"views": 10})
        assert rv.status_code == 200, rv.text
        assert rv.json()["views"] == 10 and rv.json()["title"] == "第一条"
        rv = client.delete(f"/api/v1/content/{type_key}/{rid}", headers=headers)
        assert rv.status_code == 200
        rv = client.get(f"/api/v1/content/{type_key}/{rid}", headers=headers)
        assert rv.status_code == 404
        assert rv.json()["code"] == 10321


def test_agent_scope_readonly_cannot_write(app, client):
    type_key, uid, uname = _prepare(app)
    agent_headers = _agent_token(app, uid, type_key, ["read"])
    rv = _create_note(client, agent_headers, type_key)
    assert rv.status_code == 403 and rv.json()["code"] == 10310
    rv = client.get(f"/api/v1/content/{type_key}", headers=agent_headers)
    assert rv.status_code == 200  # 读可以


def test_no_capability_403_and_unknown_type_404(app, client):
    type_key, uid, uname = _prepare(app, ops=())  # 无授权
    headers = _login(client, uname)
    rv = _create_note(client, headers, type_key)
    assert rv.status_code == 403 and rv.json()["code"] == 10310
    rv = client.get("/api/v1/content/not-exist-type", headers=headers)
    assert rv.status_code == 404 and rv.json()["code"] == 10320


def test_validation_rejects(app, client):
    type_key, uid, uname = _prepare(app)
    headers = _login(client, uname)
    bad_payloads = [
        {"title": None},  # 必填缺失
        {"title": "T", "hacker": 1},  # 未声明字段
        {"title": "T", "level": "mid"},  # 枚举外
        {"title": "T", "views": "ten"},  # 类型不符
    ]
    for payload in bad_payloads:
        rv = client.post(f"/api/v1/content/{type_key}", headers=headers, json=payload)
        assert rv.status_code == 400, (payload, rv.text)
        assert rv.json()["code"] in (10331, 10030)
    # PATCH 未声明字段
    rv = _create_note(client, headers, type_key)
    rid = rv.json()["id"]
    rv = client.patch(f"/api/v1/content/{type_key}/{rid}", headers=headers, json={"nope": 1})
    assert rv.status_code == 400


def test_record_too_large_413(app, client):
    type_key, uid, uname = _prepare(app)
    headers = _login(client, uname)
    rv = _create_note(client, headers, type_key, title="x" * 5000)  # max_length=50，同时构造大 payload
    assert rv.status_code in (400, 413)
    # 构造超 64KiB：直接调服务层（HTTP 层 max_length 已拦）
    from app.core.config import get_settings
    from app.core.errors import ContentPayloadTooLarge
    from app.services import dynamic_content_service

    class _P:
        user_id = uid
        is_root = False

    with pytest.raises(ContentPayloadTooLarge):
        # monkeypatch 字节上限为极小值走服务层
        with app.state.sessionmaker() as db:
            original = get_settings().agent_content_max_record_bytes
            get_settings().agent_content_max_record_bytes = 10
            try:
                dynamic_content_service.create_record(db, _P(), type_key, {"title": "这是一条超过十个字节的记录数据"})
            finally:
                get_settings().agent_content_max_record_bytes = original


def test_filters_sort_and_pagination(app, client):
    type_key, uid, uname = _prepare(app)
    headers = _login(client, uname)
    rows = [
        {"title": "alpha", "views": 5, "done": True, "level": "low"},
        {"title": "beta", "views": 1, "done": False, "level": "high"},
        {"title": "gamma", "views": 3, "done": True, "level": "high"},
    ]
    for row in rows:
        rv = _create_note(client, headers, type_key, **row)
        assert rv.status_code == 200, rv.text
    # 等值过滤（字符串/布尔/数字/枚举）
    rv = client.get(f"/api/v1/content/{type_key}", headers=headers, params={"f_level": "high"})
    assert rv.status_code == 200
    assert [i["title"] for i in rv.json()["items"]] == ["gamma", "beta"]  # id 倒序
    rv = client.get(f"/api/v1/content/{type_key}", headers=headers, params={"f_done": "true"})
    assert {i["title"] for i in rv.json()["items"]} == {"alpha", "gamma"}
    rv = client.get(f"/api/v1/content/{type_key}", headers=headers, params={"f_views": "3"})
    assert [i["title"] for i in rv.json()["items"]] == ["gamma"]
    # 排序：views 升序
    rv = client.get(f"/api/v1/content/{type_key}", headers=headers, params={"sort": "views", "order": "asc"})
    assert [i["title"] for i in rv.json()["items"]] == ["beta", "gamma", "alpha"]
    # 分页
    rv = client.get(f"/api/v1/content/{type_key}", headers=headers, params={"page": 0, "count": 2})
    body = rv.json()
    assert len(body["items"]) == 2 and body["total"] == 3 and body["total_page"] == 2
    # 非法过滤值/非法排序字段/过多过滤字段
    rv = client.get(f"/api/v1/content/{type_key}", headers=headers, params={"f_views": "abc"})
    assert rv.status_code == 400
    rv = client.get(f"/api/v1/content/{type_key}", headers=headers, params={"sort": "nope"})
    assert rv.status_code == 400
    rv = client.get(f"/api/v1/content/{type_key}", headers=headers, params={f"f_x{i}": str(i) for i in range(6)})
    assert rv.status_code == 400
    # 非法过滤字段名（不在 schema）
    rv = client.get(f"/api/v1/content/{type_key}", headers=headers, params={"f_hacker": "1"})
    assert rv.status_code == 400


def test_scan_cap_reports_truncated(app, client, monkeypatch):
    type_key, uid, uname = _prepare(app)
    headers = _login(client, uname)
    for i in range(12):
        _create_note(client, headers, type_key, title=f"n{i}")
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "agent_content_filter_scan_limit", 5)
    rv = client.get(f"/api/v1/content/{type_key}", headers=headers, params={"f_title": "n1"})
    assert rv.status_code == 200
    body = rv.json()
    assert body["scan_truncated"] is True
    # 不过滤时不受 scan cap 影响（纯 keyset 分页）
    rv = client.get(f"/api/v1/content/{type_key}", headers=headers, params={"count": 5})
    assert rv.status_code == 200
    assert rv.json()["total"] == 12 and rv.json()["scan_truncated"] is False


def test_requires_authentication(client):
    rv = client.get("/api/v1/content/whatever")
    assert rv.status_code == 401


def test_write_audited(app, client):
    type_key, uid, uname = _prepare(app)
    headers = _login(client, uname)
    rv = _create_note(client, headers, type_key)
    rid = rv.json()["id"]
    with app.state.sessionmaker() as db:
        from app.models import AgentAuditLog

        rows = db.query(AgentAuditLog).filter(AgentAuditLog.content_type_key == type_key).all()
        assert rows, "写操作必须落审计"
        assert all(row.action in ("create_record", "update_record", "delete_record") for row in rows)
        assert any(row.record_id == rid for row in rows)
        # 审计不存内容载荷
        for row in rows:
            assert row.detail is None or "title" not in (row.detail or "")
