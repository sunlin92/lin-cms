"""Agent Token 服务：生成、范围校验、认证、吊销（docs/04 §3.4）。

摘要方案：无 pepper 高熵 SHA-256（docs/05 已锁定决策）——
secret 为 token_urlsafe(24)，库中存 sha256(完整 token)；认证按 prefix 索引取候选后
逐个 hmac.compare_digest 比对，命中后校验吊销/过期。
"""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import (
    AgentTokenExpired,
    AgentTokenInvalid,
    AgentTokenLimitReached,
    AgentTokenRevoked,
    AgentTokenScopeInvalid,
    ParameterError,
)
from app.models import AgentToken, AgentTokenScope, ContentType
from app.repositories import agent_repo
from app.services.group_content_permission_service import user_caps

TOKEN_PREFIX_TEMPLATE = "lin_agent_{prefix}_{secret}"
PREFIX_LENGTH = 8
LAST_USED_THROTTLE = timedelta(minutes=5)


def generate_token() -> tuple[str, str, str]:
    """返回 (明文, prefix, sha256 摘要)。"""
    prefix = secrets.token_hex(PREFIX_LENGTH // 2)
    secret = secrets.token_urlsafe(24)
    plaintext = TOKEN_PREFIX_TEMPLATE.format(prefix=prefix, secret=secret)
    digest = hashlib.sha256(plaintext.encode()).hexdigest()
    return plaintext, prefix, digest


def _resolve_scope(db: Session, user_id: int, scope_entries: list[dict]) -> list[dict]:
    """范围必须是「用户当前能力 ∩ 显式勾选」的非空子集。"""
    if not scope_entries:
        raise AgentTokenScopeInvalid("至少需要选择一个内容类型范围")
    resolved: list[dict] = []
    for entry in scope_entries:
        type_id = entry["content_type_id"]
        wanted = set(entry.get("ops") or [])
        if not wanted:
            raise AgentTokenScopeInvalid("每个范围条目至少选择一个操作")
        ct = db.get(ContentType, type_id)
        if ct is None or ct.status != "active":
            raise AgentTokenScopeInvalid(f"内容类型不可用：{type_id}")
        caps = user_caps(db, user_id, type_id)
        excess = wanted - caps
        if excess:
            raise AgentTokenScopeInvalid(f"范围超出当前用户被授予的能力：{ct.key} 不允许 {'/'.join(sorted(excess))}")
        resolved.append({"content_type_id": type_id, "ops": sorted(wanted)})
    return resolved


def create_token(db: Session, *, user_id: int, name: str, ttl_days: int | None, scope_entries: list[dict]) -> dict:
    settings = get_settings()
    days = ttl_days or settings.agent_token_default_ttl_days
    if days <= 0 or days > settings.agent_token_max_ttl_days:
        raise ParameterError(f"有效期必须是 1..{settings.agent_token_max_ttl_days} 天")
    if agent_repo.active_count_for_user(db, user_id) >= settings.agent_token_max_active_per_user:
        raise AgentTokenLimitReached()
    resolved = _resolve_scope(db, user_id, scope_entries)

    plaintext, prefix, digest = generate_token()
    token = AgentToken(
        user_id=user_id,
        name=name,
        prefix=prefix,
        secret_digest=digest,
        expires_at=datetime.utcnow() + timedelta(days=days),
    )
    db.add(token)
    db.flush()
    op_flags = {"read": "can_read", "create": "can_create", "update": "can_update", "delete": "can_delete"}
    for item in resolved:
        flags = {op_flags[op]: op in item["ops"] for op in op_flags}
        db.add(AgentTokenScope(agent_token_id=token.id, content_type_id=item["content_type_id"], **flags))
    db.flush()
    return {
        "token_id": token.id,
        "token": plaintext,  # 仅此一次返回明文
        "prefix": prefix,
        "expires_at": token.expires_at.isoformat(),
        "scope": resolved,
    }


def _audit_auth(db: Session, *, token_id: int | None, user_id: int, success: bool, error_code: int | None) -> None:
    from app.services import agent_audit_service

    agent_audit_service.record(
        db, user_id=user_id, action="token_auth", success=success, agent_token_id=token_id, error_code=error_code
    )


def authenticate(db: Session, plaintext: str) -> AgentToken:
    """认证并返回 token 行；吊销/过期/不存在分别抛对应错误。"""
    # secret（token_urlsafe）自身可含 "_"，因此限定切分次数
    parts = plaintext.split("_", 3)
    if len(parts) != 4 or parts[0] != "lin" or parts[1] != "agent" or len(parts[2]) != PREFIX_LENGTH:
        _audit_auth(db, token_id=None, user_id=0, success=False, error_code=AgentTokenInvalid.code)
        db.commit()
        raise AgentTokenInvalid()
    digest = hashlib.sha256(plaintext.encode()).hexdigest()
    candidates = agent_repo.find_by_prefix(db, parts[2])
    matched: AgentToken | None = None
    for candidate in candidates:
        if hmac.compare_digest(candidate.secret_digest, digest):
            matched = candidate
            break
    if matched is None:
        _audit_auth(db, token_id=None, user_id=0, success=False, error_code=AgentTokenInvalid.code)
        db.commit()
        raise AgentTokenInvalid()
    if matched.revoked_at is not None:
        _audit_auth(db, token_id=matched.id, user_id=matched.user_id, success=False, error_code=AgentTokenRevoked.code)
        db.commit()
        raise AgentTokenRevoked()
    if matched.expires_at <= datetime.utcnow():
        _audit_auth(db, token_id=matched.id, user_id=matched.user_id, success=False, error_code=AgentTokenExpired.code)
        db.commit()
        raise AgentTokenExpired()
    _audit_auth(db, token_id=matched.id, user_id=matched.user_id, success=True, error_code=None)
    now = datetime.utcnow()
    if matched.last_used_at is None or now - matched.last_used_at >= LAST_USED_THROTTLE:
        matched.last_used_at = now
        db.flush()
    return matched


def revoke_token(db: Session, token_id: int, *, operator_id: int, reason: str) -> AgentToken:
    token = db.get(AgentToken, token_id)
    if token is None:
        from app.core.errors import NotFound

        raise NotFound("Token 不存在")
    if token.revoked_at is None:
        token.revoked_at = datetime.utcnow()
        db.flush()
    from app.services import agent_audit_service

    agent_audit_service.record(
        db,
        user_id=token.user_id,
        action="revoke_token",
        success=True,
        agent_token_id=token.id,
        detail=f"reason={reason};operator={operator_id}",
    )
    return token


def revoke_all_for_user(db: Session, user_id: int, *, reason: str) -> int:
    rows = [row for row in agent_repo.list_for_user(db, user_id) if row.revoked_at is None]
    now = datetime.utcnow()
    for row in rows:
        row.revoked_at = now
    db.flush()
    return len(rows)


def delete_all_for_user(db: Session, user_id: int) -> int:
    """用户被删除时清理 token 行与 scope（审计行无外键、保留历史）。"""
    from sqlalchemy import delete as sa_delete

    tokens = list(agent_repo.list_for_user(db, user_id))
    ids = [t.id for t in tokens]
    if ids:
        db.execute(sa_delete(AgentTokenScope).where(AgentTokenScope.agent_token_id.in_(ids)))
        db.execute(sa_delete(AgentToken).where(AgentToken.id.in_(ids)))
        db.flush()
    return len(ids)


def list_tokens_payload(db: Session, user_id: int) -> list[dict]:
    rows = agent_repo.list_for_user(db, user_id)
    type_keys = {row.id: row.key for row in db.query(ContentType).all()}
    payload: list[dict] = []
    for token in rows:
        scopes = agent_repo.scopes_of(db, token.id)
        payload.append(
            {
                "id": token.id,
                "name": token.name,
                "prefix": token.prefix,
                "expires_at": token.expires_at.isoformat(),
                "last_used_at": token.last_used_at.isoformat() if token.last_used_at else None,
                "revoked_at": token.revoked_at.isoformat() if token.revoked_at else None,
                "create_time": token.create_time.isoformat() if token.create_time else None,
                "scope": [
                    {
                        "content_type_id": scope.content_type_id,
                        "content_type_key": type_keys.get(scope.content_type_id),
                        "ops": [
                            op
                            for op, flag in (
                                ("read", scope.can_read),
                                ("create", scope.can_create),
                                ("update", scope.can_update),
                                ("delete", scope.can_delete),
                            )
                            if flag
                        ],
                    }
                    for scope in scopes
                ],
            }
        )
    return payload


def admin_list_tokens_payload(db: Session, *, user_id: int | None, page: int, count: int) -> dict:
    rows, total = agent_repo.list_all(db, user_id=user_id, page=page, count=count)
    return {
        "items": [
            {
                "id": row.id,
                "user_id": row.user_id,
                "name": row.name,
                "prefix": row.prefix,
                "expires_at": row.expires_at.isoformat(),
                "last_used_at": row.last_used_at.isoformat() if row.last_used_at else None,
                "revoked_at": row.revoked_at.isoformat() if row.revoked_at else None,
            }
            for row in rows
        ],
        "page": page,
        "count": len(rows),
        "total": total,
        "total_page": (total + count - 1) // count,
    }
