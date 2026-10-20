"""Agent 审计查询路由（Root，分页+过滤）与保留清理（docs/04 §3.5/§5）。"""

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_root
from app.core.config import get_settings
from app.core.errors import ParameterError
from app.db.session import get_db
from app.models import AgentAuditLog, User
from app.services import agent_audit_service

router = APIRouter(prefix="/api/v1/admin", tags=["Agent 审计"])


@router.get("/agent-audit")
def list_audit(
    page: int = 0,
    count: int = 5,
    token_id: int | None = None,
    action: str | None = None,
    content_type_key: str | None = None,
    start: str | None = None,
    end: str | None = None,
    db: Session = Depends(get_db),
    _operator: User = Depends(require_root),
) -> dict:
    query = select(AgentAuditLog).order_by(AgentAuditLog.id.desc())
    if token_id is not None:
        query = query.where(AgentAuditLog.agent_token_id == token_id)
    if action:
        query = query.where(AgentAuditLog.action == action)
    if content_type_key:
        query = query.where(AgentAuditLog.content_type_key == content_type_key)
    try:
        if start:
            query = query.where(AgentAuditLog.create_time >= datetime.fromisoformat(start))
        if end:
            query = query.where(AgentAuditLog.create_time <= datetime.fromisoformat(end))
    except ValueError as exc:
        raise ParameterError("start/end 需要 ISO 日期时间格式") from exc
    if page < 0 or not 1 <= count <= 15:
        raise ParameterError("分页参数不合法")

    from sqlalchemy import func

    total = int(db.scalar(select(func.count()).select_from(query.subquery())) or 0)
    rows = list(db.scalars(query.offset(page * count).limit(count)))
    window = rows
    return {
        "items": [
            {
                "id": row.id,
                "agent_token_id": row.agent_token_id,
                "user_id": row.user_id,
                "content_type_key": row.content_type_key,
                "record_id": row.record_id,
                "action": row.action,
                "success": row.success,
                "error_code": row.error_code,
                "create_time": row.create_time.isoformat() if row.create_time else None,
            }
            for row in window
        ],
        "page": page,
        "count": len(window),
        "total": total,
        "total_page": (total + count - 1) // count,
    }


def cleanup_expired_now(db: Session) -> int:
    """低频维护入口：删除超过保留期的审计行并提交。"""
    removed = agent_audit_service.cleanup_expired(db, retention_days=get_settings().agent_audit_retention_days)
    db.commit()
    return removed
