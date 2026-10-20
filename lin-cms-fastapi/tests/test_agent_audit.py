"""审计查询、事务原子性与保留清理测试（docs/05 Task 10，规格 §3.5）。"""

from datetime import datetime, timedelta

import pytest

from app.models import AgentAuditLog
from app.services import agent_audit_service


@pytest.fixture()
def db(app):
    with app.state.sessionmaker() as session:
        yield session


def _row(db, **kwargs) -> None:
    defaults = {"user_id": 1, "action": "create_record", "success": True}
    defaults.update(kwargs)
    agent_audit_service.record(db, **defaults)
    db.commit()


def test_query_pagination_and_filters(db, client, root_headers):
    _row(db, content_type_key="qa", action="create_record")
    _row(db, content_type_key="qa", action="token_auth", success=False, error_code=10310)
    _row(db, content_type_key="qb", action="delete_record")
    rv = client.get("/api/v1/admin/agent-audit", headers=root_headers, params={"count": 15})
    assert rv.status_code == 200, rv.text
    body = rv.json()
    assert body["total"] >= 3
    items = body["items"]
    assert all({"id", "user_id", "action", "success", "create_time"} <= set(item) for item in items)
    # 无 secret/载荷字段
    raw = rv.text
    assert "lin_agent_" not in raw and "authorization" not in raw.lower()
    # 过滤：action
    rv = client.get("/api/v1/admin/agent-audit", headers=root_headers, params={"action": "token_auth"})
    assert all(item["action"] == "token_auth" for item in rv.json()["items"])
    # 过滤：content_type_key
    rv = client.get("/api/v1/admin/agent-audit", headers=root_headers, params={"content_type_key": "qb"})
    assert {item["action"] for item in rv.json()["items"]} == {"delete_record"}
    # 非 Root 403
    rv = client.get("/api/v1/admin/agent-audit")
    assert rv.status_code == 401


def test_audit_row_has_no_payload_secrets(db):
    _row(db, content_type_key="qa")
    row = db.query(AgentAuditLog).order_by(AgentAuditLog.id.desc()).first()
    assert row.detail is None
    assert row.request_id is None


def test_cleanup_expired(db):
    fresh_time = datetime.utcnow() - timedelta(days=1)
    old_time = datetime.utcnow() - timedelta(days=200)
    _row(db)  # 新
    stale = AgentAuditLog(user_id=1, action="create_record", success=True, create_time=old_time)
    db.add(stale)
    fresh = AgentAuditLog(user_id=1, action="delete_record", success=True, create_time=fresh_time)
    db.add(fresh)
    db.commit()
    removed = agent_audit_service.cleanup_expired(db, retention_days=180)
    db.commit()
    assert removed >= 1
    remaining = {row.id for row in db.query(AgentAuditLog).all()}
    assert stale.id not in remaining
    assert fresh.id in remaining


def test_content_write_and_audit_atomic(app, client, monkeypatch):
    """审计写入失败 → 内容写一并回滚（同事务）。"""
    from app.services import dynamic_content_service as svc

    def _boom(*args, **kwargs):
        raise RuntimeError("audit down")

    monkeypatch.setattr(svc.agent_audit_service, "record", _boom)
    # 准备类型与授权；TestClient 关闭异常透传以便断言 500
    from fastapi.testclient import TestClient

    from tests.test_content_records import _create_note, _login, _prepare

    type_key, uid, uname = _prepare(app)
    with TestClient(app, raise_server_exceptions=False) as plain_client:
        headers = _login(plain_client, uname)
        rv = _create_note(plain_client, headers, type_key, title="原子性")
    assert rv.status_code == 500
    with app.state.sessionmaker() as session:
        from app.models import ContentRecord

        assert session.query(ContentRecord).filter(ContentRecord.data_json.like("%原子性%")).count() == 0, (
            "审计失败时内容不得半提交"
        )
