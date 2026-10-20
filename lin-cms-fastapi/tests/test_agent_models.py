"""Agent/内容数据模型与约束测试（docs/05 Task 2）。"""

from datetime import datetime

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    AgentAuditLog,
    AgentToken,
    AgentTokenScope,
    Base,
    ContentRecord,
    ContentType,
    Group,
    GroupContentPermission,
    User,
)


@pytest.fixture()
def db() -> Session:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    event.listen(engine, "connect", lambda dbapi_conn, _: dbapi_conn.execute("PRAGMA foreign_keys=ON"))
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def _make_type(db: Session) -> ContentType:
    ct = ContentType(key="product", name="商品", schema_json="[]")
    db.add(ct)
    db.flush()
    return ct


def test_content_type_key_unique(db: Session) -> None:
    _make_type(db)
    db.add(ContentType(key="product", name="重复", schema_json="[]"))
    with pytest.raises(IntegrityError):
        db.flush()


def test_group_content_permission_unique_pair(db: Session) -> None:
    db.add(Group(name="G1", level=2))
    db.flush()
    ct = _make_type(db)
    db.add(GroupContentPermission(group_id=1, content_type_id=ct.id, can_read=True))
    db.flush()
    db.add(GroupContentPermission(group_id=1, content_type_id=ct.id, can_create=True))
    with pytest.raises(IntegrityError):
        db.flush()


def test_agent_token_digest_unique(db: Session) -> None:
    db.add(User(username="u1"))
    db.flush()
    db.add(AgentToken(user_id=1, name="a", prefix="abcd1234", secret_digest="d" * 64, expires_at=datetime(2027, 1, 1)))
    db.flush()
    db.add(AgentToken(user_id=2, name="b", prefix="ffff0000", secret_digest="d" * 64, expires_at=datetime(2027, 1, 1)))
    with pytest.raises(IntegrityError):
        db.flush()


def test_agent_token_scope_unique_pair(db: Session) -> None:
    db.add(User(username="u1"))
    db.flush()
    token = AgentToken(user_id=1, name="a", prefix="abcd1234", secret_digest="d" * 64, expires_at=datetime(2027, 1, 1))
    db.add(token)
    db.flush()
    ct = _make_type(db)
    db.add(AgentTokenScope(agent_token_id=token.id, content_type_id=ct.id, can_read=True))
    db.flush()
    db.add(AgentTokenScope(agent_token_id=token.id, content_type_id=ct.id, can_update=True))
    with pytest.raises(IntegrityError):
        db.flush()


def test_audit_log_row_shape(db: Session) -> None:
    db.add(
        AgentAuditLog(
            user_id=1,
            content_type_key="product",
            action="create_record",
            success=True,
        )
    )
    db.flush()
    row = db.scalar(select(AgentAuditLog))
    assert row.agent_token_id is None
    assert row.record_id is None
    assert row.error_code is None


def test_foreign_keys_enforced(db: Session) -> None:
    db.add(User(username="u1"))
    db.add(Group(name="G", level=2))
    db.flush()
    user = db.scalar(select(User))
    user_id = user.id
    group = db.scalar(select(Group))
    ct = _make_type(db)
    # 合法外键可写入
    db.add(GroupContentPermission(group_id=group.id, content_type_id=ct.id, can_read=True))
    db.flush()
    # 非法 user_id 触发外键约束
    db.add(
        AgentToken(
            user_id=99999, name="bad", prefix="aaaa0000", secret_digest="e" * 64, expires_at=datetime(2027, 1, 1)
        )
    )
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()
    assert user_id == 1


def test_content_record_defaults(db: Session) -> None:
    ct = _make_type(db)
    db.add(ContentRecord(content_type_id=ct.id, data_json='{"title":"x"}'))
    db.flush()
    row = db.scalar(select(ContentRecord))
    assert row.deleted_token == 0
    assert row.deleted_at is None
    # 软删除后唯一形态：deleted_token=id
    row.soft_delete()
    assert row.deleted_token == row.id
