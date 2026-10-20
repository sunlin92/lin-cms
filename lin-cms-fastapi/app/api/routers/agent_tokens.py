"""用户 Agent Token 路由：本人管理与 Root 代管（docs/04 §5.3）。

明文只在 POST 响应出现一次；列表/管理端点永不返回摘要或明文。
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_root
from app.core.errors import NotFound, success_envelope
from app.core.rate_limit import scope_limiter
from app.db.session import get_db
from app.models import AgentToken, User
from app.services import agent_token_service

router = APIRouter(
    prefix="/api/v1",
    tags=["Agent Token"],
    dependencies=[Depends(scope_limiter("agent_content"))],
)


class ScopeEntryIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content_type_id: int
    ops: list[str] = Field(min_length=1)


class TokenCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    ttl_days: int | None = Field(default=None, gt=0, le=365)
    scope: list[ScopeEntryIn] = Field(min_length=1)


@router.get("/agent-tokens")
def list_my_tokens(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[dict]:
    return agent_token_service.list_tokens_payload(db, user.id)


@router.post("/agent-tokens")
def create_my_token(
    payload: TokenCreateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """创建 Token；响应中的 token 字段为一次性明文，之后不可再查看。"""
    result = agent_token_service.create_token(
        db,
        user_id=user.id,
        name=payload.name,
        ttl_days=payload.ttl_days,
        scope_entries=[entry.model_dump() for entry in payload.scope],
    )
    db.commit()
    return result


@router.delete("/agent-tokens/{token_id}")
def revoke_my_token(
    token_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    token = db.get(AgentToken, token_id)
    if token is None or token.user_id != user.id:
        raise NotFound("Token 不存在")  # 他人 token 统一 404，降低枚举
    agent_token_service.revoke_token(db, token_id, operator_id=user.id, reason="user_revoked")
    db.commit()
    return success_envelope(request, message="Token 已吊销")


@router.get("/admin/agent-tokens")
def admin_list_tokens(
    page: Annotated[int, Query(ge=0)] = 0,
    count: Annotated[int, Query(ge=1, le=15)] = 5,
    user_id: int | None = None,
    db: Session = Depends(get_db),
    _operator: User = Depends(require_root),
) -> dict:
    return agent_token_service.admin_list_tokens_payload(db, user_id=user_id, page=page, count=count)


class AdminRevokeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(min_length=1, max_length=200)


@router.post("/admin/agent-tokens/{token_id}/revoke")
def admin_revoke_token(
    token_id: int,
    payload: AdminRevokeIn,
    request: Request,
    db: Session = Depends(get_db),
    operator: User = Depends(require_root),
) -> dict:
    token = agent_token_service.revoke_token(db, token_id, operator_id=operator.id, reason=payload.reason)
    db.commit()
    return success_envelope(request, message=f"已吊销 Token（prefix={token.prefix}）")
