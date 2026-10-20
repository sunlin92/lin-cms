"""Agent 审计服务：与内容写操作同事务落库（docs/04 §3.5）。

只存元数据；签名刻意不接收密钥、请求头或内容载荷参数。
"""

from sqlalchemy.orm import Session

from app.models import AgentAuditLog


def record(
    db: Session,
    *,
    user_id: int,
    action: str,
    success: bool,
    agent_token_id: int | None = None,
    content_type_key: str | None = None,
    record_id: int | None = None,
    error_code: int | None = None,
    request_id: str | None = None,
    detail: str | None = None,
) -> None:
    """追加一条审计行（不 commit，随内容操作同事务提交）。detail 只允许元数据（如吊销原因），禁止内容载荷。"""
    db.add(
        AgentAuditLog(
            agent_token_id=agent_token_id,
            user_id=user_id,
            content_type_key=content_type_key,
            record_id=record_id,
            action=action,
            success=success,
            error_code=error_code,
            request_id=request_id,
            detail=detail,
        )
    )
    db.flush()


def query(
    db: Session,
    *,
    page: int,
    count: int,
    token_id: int | None = None,
    action: str | None = None,
    content_type_key: str | None = None,
    start=None,
    end=None,
) -> dict:
    """分页查询审计（Root）；过滤条件均为可选。"""
    from datetime import datetime, timedelta  # noqa: F401

    from sqlalchemy import select

    from app.models import AgentAuditLog

    stmt = select(AgentAuditLog).order_by(AgentAuditLog.id.desc())
    if token_id is not None:
        stmt = stmt.where(AgentAuditLog.agent_token_id == token_id)
    if action:
        stmt = stmt.where(AgentAuditLog.action == action)
    if content_type_key:
        stmt = stmt.where(AgentAuditLog.content_type_key == content_type_key)
    if start is not None:
        stmt = stmt.where(AgentAuditLog.create_time >= start)
    if end is not None:
        stmt = stmt.where(AgentAuditLog.create_time <= end)
    rows = list(db.scalars(stmt))
    total = len(rows)
    window = rows[page * count : (page + 1) * count]
    return {
        "items": [_row_payload(r) for r in window],
        "page": page,
        "count": len(window),
        "total": total,
        "total_page": (total + count - 1) // count,
    }


def _row_payload(row) -> dict:
    return {
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


def cleanup_expired(db: Session, *, retention_days: int) -> int:
    """删除超过保留期的审计行；返回删除行数。"""
    from datetime import datetime, timedelta

    from sqlalchemy import delete as sa_delete

    from app.models import AgentAuditLog

    cutoff = datetime.utcnow() - timedelta(days=retention_days)
    result = db.execute(sa_delete(AgentAuditLog).where(AgentAuditLog.create_time < cutoff))
    db.flush()
    return int(result.rowcount or 0)
