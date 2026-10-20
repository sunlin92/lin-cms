"""Agent Token 服务层测试（docs/05 Task 7，规格 §3.4）。"""

from datetime import datetime, timedelta

import pytest

from app.core.errors import (
    AgentTokenExpired,
    AgentTokenInvalid,
    AgentTokenLimitReached,
    AgentTokenRevoked,
    AgentTokenScopeInvalid,
    ParameterError,
)
from app.models import AgentToken, ContentType, GroupContentPermission, UserGroup
from app.services import agent_token_service


@pytest.fixture()
def db(app):
    with app.state.sessionmaker() as session:
        yield session


def _setup_type_and_grant(db, *, ops=("read", "create")):
    """建内容类型并给 Guest 组（id=2）授权，tester 用户在 Guest 组。"""
    ct = ContentType(key=f"tk-{datetime.now().timestamp()}", name="T", schema_json="[]")
    db.add(ct)
    db.flush()
    grants = {
        "read": "can_read",
        "create": "can_create",
        "update": "can_update",
        "delete": "can_delete",
    }
    db.add(GroupContentPermission(group_id=2, content_type_id=ct.id, **{grants[op]: True for op in ops}))
    db.commit()
    return ct


_USER_SEQ = 0


def _new_user(db) -> int:
    """每个测试创建独立用户（入 Guest 组），避免共享库串号。"""
    global _USER_SEQ
    from app.repositories import user_repo

    _USER_SEQ += 1
    user = user_repo.create_user(db, username=f"tk-{datetime.now().timestamp()}-{_USER_SEQ}")
    db.add(UserGroup(user_id=user.id, group_id=2))
    db.commit()
    return user.id


def test_generate_token_shape() -> None:
    plaintext, prefix, digest = agent_token_service.generate_token()
    assert plaintext.startswith(f"lin_agent_{prefix}_")
    assert len(prefix) == 8 and prefix == plaintext.split("_")[2]
    assert len(digest) == 64
    import hashlib

    assert digest == hashlib.sha256(plaintext.encode()).hexdigest()
    # 熵检查：两次生成不相同
    other, _, _ = agent_token_service.generate_token()
    assert other != plaintext


def test_create_token_stores_digest_not_plaintext(db) -> None:
    ct = _setup_type_and_grant(db)
    result = agent_token_service.create_token(
        db,
        user_id=_new_user(db),
        name="ci",
        ttl_days=30,
        scope_entries=[{"content_type_id": ct.id, "ops": ["read"]}],
    )
    assert result["token"].startswith("lin_agent_")
    token_row = db.get(AgentToken, result["token_id"])
    assert token_row.secret_digest == hashlib_of(result["token"])
    assert token_row.secret_digest != result["token"]
    assert "lin_agent_" not in token_row.secret_digest


def hashlib_of(text: str) -> str:
    import hashlib

    return hashlib.sha256(text.encode()).hexdigest()


def test_scope_must_be_subset_of_user_caps(db) -> None:
    ct = _setup_type_and_grant(db, ops=("read",))  # 用户只有 read
    with pytest.raises(AgentTokenScopeInvalid):
        agent_token_service.create_token(
            db,
            user_id=_new_user(db),
            name="ci",
            ttl_days=30,
            scope_entries=[{"content_type_id": ct.id, "ops": ["read", "delete"]}],
        )
    # 空 scope 拒绝
    with pytest.raises(AgentTokenScopeInvalid):
        agent_token_service.create_token(db, user_id=_new_user(db), name="ci", ttl_days=30, scope_entries=[])


def test_ttl_bounds(db, app) -> None:
    ct = _setup_type_and_grant(db)
    uid = _new_user(db)
    with pytest.raises(ParameterError):
        agent_token_service.create_token(
            db, user_id=uid, name="ci", ttl_days=366, scope_entries=[{"content_type_id": ct.id, "ops": ["read"]}]
        )


def test_max_active_tokens(db) -> None:
    ct = _setup_type_and_grant(db)
    uid = _new_user(db)
    for _ in range(20):
        agent_token_service.create_token(
            db, user_id=uid, name="ci", ttl_days=30, scope_entries=[{"content_type_id": ct.id, "ops": ["read"]}]
        )
    with pytest.raises(AgentTokenLimitReached):
        agent_token_service.create_token(
            db, user_id=uid, name="ci", ttl_days=30, scope_entries=[{"content_type_id": ct.id, "ops": ["read"]}]
        )


def test_authenticate_happy_and_failures(db) -> None:
    ct = _setup_type_and_grant(db)
    uid = _new_user(db)
    result = agent_token_service.create_token(
        db, user_id=uid, name="ci", ttl_days=30, scope_entries=[{"content_type_id": ct.id, "ops": ["read"]}]
    )
    plaintext = result["token"]
    token = agent_token_service.authenticate(db, plaintext)
    assert token.user_id == uid

    with pytest.raises(AgentTokenInvalid):
        agent_token_service.authenticate(db, "lin_agent_deadbeef_wrongsecretwrongsecret00")
    # 伪造 prefix 不匹配 → invalid
    with pytest.raises(AgentTokenInvalid):
        agent_token_service.authenticate(db, plaintext.replace(token.prefix, "00000000"))
    # 吊销后立即失效
    agent_token_service.revoke_token(db, token.id, operator_id=token.user_id, reason="test")
    db.commit()
    with pytest.raises(AgentTokenRevoked):
        agent_token_service.authenticate(db, plaintext)


def test_authenticate_expired(db) -> None:
    ct = _setup_type_and_grant(db)
    result = agent_token_service.create_token(
        db, user_id=_new_user(db), name="ci", ttl_days=30, scope_entries=[{"content_type_id": ct.id, "ops": ["read"]}]
    )
    token = db.get(AgentToken, result["token_id"])
    token.expires_at = datetime.utcnow() - timedelta(days=1)
    db.commit()
    with pytest.raises(AgentTokenExpired):
        agent_token_service.authenticate(db, result["token"])


def test_constant_time_compare_used(db, monkeypatch) -> None:
    ct = _setup_type_and_grant(db)
    result = agent_token_service.create_token(
        db, user_id=_new_user(db), name="ci", ttl_days=30, scope_entries=[{"content_type_id": ct.id, "ops": ["read"]}]
    )
    calls: list[tuple[str, str]] = []
    import hmac as hmac_mod

    original = hmac_mod.compare_digest

    def spy(a, b):
        calls.append((a, b))
        return original(a, b)

    monkeypatch.setattr("app.services.agent_token_service.hmac.compare_digest", spy)
    agent_token_service.authenticate(db, result["token"])
    assert calls, "认证必须走恒定时间比较"


def test_last_used_throttled(db) -> None:
    ct = _setup_type_and_grant(db)
    result = agent_token_service.create_token(
        db, user_id=_new_user(db), name="ci", ttl_days=30, scope_entries=[{"content_type_id": ct.id, "ops": ["read"]}]
    )
    token = db.get(AgentToken, result["token_id"])
    old = datetime.utcnow() - timedelta(minutes=4)
    token.last_used_at = old
    db.commit()
    agent_token_service.authenticate(db, result["token"])
    assert token.last_used_at == old  # 5 分钟内不重复写
    token.last_used_at = datetime.utcnow() - timedelta(minutes=6)
    db.commit()
    agent_token_service.authenticate(db, result["token"])
    assert token.last_used_at is not None and token.last_used_at != old


def test_revoke_all_for_user(db) -> None:
    ct = _setup_type_and_grant(db)
    uid = _new_user(db)
    for _ in range(3):
        agent_token_service.create_token(
            db, user_id=uid, name="ci", ttl_days=30, scope_entries=[{"content_type_id": ct.id, "ops": ["read"]}]
        )
    count = agent_token_service.revoke_all_for_user(db, uid, reason="password_changed")
    db.commit()
    assert count == 3
    assert db.query(AgentToken).filter(AgentToken.user_id == uid, AgentToken.revoked_at.is_(None)).count() == 0


def test_revoke_writes_audit_with_reason(db) -> None:
    """管理员/本人吊销必须落审计行并携带 reason（docs/04 §5.3）。"""
    from app.models import AgentAuditLog

    ct = _setup_type_and_grant(db)
    uid = _new_user(db)
    result = agent_token_service.create_token(
        db, user_id=uid, name="rv", ttl_days=30, scope_entries=[{"content_type_id": ct.id, "ops": ["read"]}]
    )
    agent_token_service.revoke_token(db, result["token_id"], operator_id=999, reason="audit-disposal")
    db.commit()
    row = (
        db.query(AgentAuditLog)
        .filter(AgentAuditLog.action == "revoke_token", AgentAuditLog.agent_token_id == result["token_id"])
        .one()
    )
    assert row.agent_token_id == result["token_id"]
    assert row.user_id == uid
    assert "audit-disposal" in (row.detail or "")


def test_authenticate_writes_token_auth_audit(db) -> None:
    """认证成功与失败都要写 token_auth 审计（docs/05 Task 7 / docs/04 §3.5）。"""
    from app.models import AgentAuditLog

    ct = _setup_type_and_grant(db)
    uid = _new_user(db)
    result = agent_token_service.create_token(
        db, user_id=uid, name="au", ttl_days=30, scope_entries=[{"content_type_id": ct.id, "ops": ["read"]}]
    )
    db.commit()
    db.query(AgentAuditLog).filter(AgentAuditLog.action == "token_auth").delete()
    db.commit()
    agent_token_service.authenticate(db, result["token"])
    db.commit()
    ok = (
        db.query(AgentAuditLog)
        .filter(
            AgentAuditLog.action == "token_auth",
            AgentAuditLog.agent_token_id == result["token_id"],
            AgentAuditLog.success.is_(True),
        )
        .one()
    )
    assert ok.agent_token_id == result["token_id"]
    db.query(AgentAuditLog).filter(AgentAuditLog.action == "token_auth").delete()
    db.commit()
    try:
        agent_token_service.authenticate(db, "lin_agent_00000000_nosuchsecret0000000000")
    except Exception:
        pass
    db.commit()
    fail = db.query(AgentAuditLog).filter(AgentAuditLog.action == "token_auth", AgentAuditLog.success.is_(False)).one()
    assert fail.agent_token_id is None and fail.error_code == 10300
