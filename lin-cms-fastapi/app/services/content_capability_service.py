"""内容能力授权服务：用户能力 ∩ Token 静态范围（docs/04 §4.2）。

- 会话主体（浏览器 JWT）：有效能力 = 用户分组授权并集。
- Agent 主体：有效能力 = 用户能力 ∩ Token 静态 scope；Root 标志不参与。
- 每次调用现查数据库，不做缓存——授权撤销即时生效。
"""

from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from app.core.errors import ContentForbidden, ContentTypeArchived
from app.models import AgentTokenScope, ContentType
from app.services.group_content_permission_service import user_caps

if TYPE_CHECKING:
    pass

WRITE_OPS = ("create", "update", "delete")


def _token_caps(db: Session, token_id: int, content_type_id: int) -> set[str]:
    scope = (
        db.query(AgentTokenScope)
        .filter(
            AgentTokenScope.agent_token_id == token_id,
            AgentTokenScope.content_type_id == content_type_id,
        )
        .first()
    )
    if scope is None:
        return set()
    return {
        op
        for op, flag in (
            ("read", scope.can_read),
            ("create", scope.can_create),
            ("update", scope.can_update),
            ("delete", scope.can_delete),
        )
        if flag
    }


def effective_caps(db: Session, principal, content_type_id: int) -> set[str]:
    """principal 为 UserSessionPrincipal 或 AgentTokenPrincipal（见 app.api.deps）。"""
    caps = user_caps(db, principal.user_id, content_type_id)
    principal_type = type(principal).__name__
    if principal_type == "AgentTokenPrincipal":
        caps = caps & _token_caps(db, principal.token_id, content_type_id)
    return caps


def require_cap(db: Session, principal, content_type_id: int, op: str) -> None:
    """校验操作能力；写操作额外要求模型 active（归档禁写，读仍可）。"""
    ct = db.get(ContentType, content_type_id)
    if ct is None:
        raise ContentForbidden()
    if op in WRITE_OPS and ct.status != "active":
        raise ContentTypeArchived()
    caps = effective_caps(db, principal, content_type_id)
    if op not in caps:
        raise ContentForbidden()
