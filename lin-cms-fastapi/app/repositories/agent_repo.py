"""Agent Token 数据访问层：只做查询，不含业务规则。"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AgentToken, AgentTokenScope


def find_by_prefix(db: Session, prefix: str) -> list[AgentToken]:
    return list(db.scalars(select(AgentToken).where(AgentToken.prefix == prefix)))


def find_by_digest(db: Session, digest: str) -> AgentToken | None:
    return db.scalar(select(AgentToken).where(AgentToken.secret_digest == digest))


def active_count_for_user(db: Session, user_id: int) -> int:
    from sqlalchemy import func

    return int(
        db.scalar(
            select(func.count(AgentToken.id)).where(
                AgentToken.user_id == user_id,
                AgentToken.revoked_at.is_(None),
                AgentToken.expires_at > datetime.utcnow(),
            )
        )
        or 0
    )


def scopes_of(db: Session, token_id: int) -> list[AgentTokenScope]:
    return list(db.scalars(select(AgentTokenScope).where(AgentTokenScope.agent_token_id == token_id)))


def list_for_user(db: Session, user_id: int) -> list[AgentToken]:
    return list(db.scalars(select(AgentToken).where(AgentToken.user_id == user_id).order_by(AgentToken.id.desc())))


def list_all(db: Session, *, user_id: int | None, page: int, count: int) -> tuple[list[AgentToken], int]:
    from sqlalchemy import func

    base = select(AgentToken)
    if user_id is not None:
        base = base.where(AgentToken.user_id == user_id)
    total = int(db.scalar(select(func.count()).select_from(base.subquery())) or 0)
    items = list(db.scalars(base.order_by(AgentToken.id.desc()).offset(page * count).limit(count)))
    return items, total
