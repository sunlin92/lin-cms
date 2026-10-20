"""Agent Token 及其静态范围、审计日志（docs/04 §3.4-§3.5）。

审计表为追加型历史记录：不设外键，主体删除后历史行保持完整。
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AgentToken(Base):
    """用户拥有的不透明 Agent Token；库中仅存 SHA-256 摘要，明文只在创建时展示一次。"""

    __tablename__ = "lin_agent_token"

    id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer(), ForeignKey("lin_user.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    prefix: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    secret_digest: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(), default=None)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(), default=None)
    create_time: Mapped[datetime] = mapped_column(DateTime(), server_default=func.now(), nullable=False)


class AgentTokenScope(Base):
    """Token 静态范围：未选类型/操作默认禁止；有效能力 = 用户能力 ∩ Token 范围。"""

    __tablename__ = "lin_agent_token_scope"
    __table_args__ = (UniqueConstraint("agent_token_id", "content_type_id", name="uq_token_scope_type"),)

    id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    agent_token_id: Mapped[int] = mapped_column(Integer(), ForeignKey("lin_agent_token.id"), nullable=False, index=True)
    content_type_id: Mapped[int] = mapped_column(
        Integer(), ForeignKey("lin_content_type.id"), nullable=False, index=True
    )
    can_read: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    can_create: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    can_update: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    can_delete: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)


class AgentAuditLog(Base):
    """Agent 操作审计：只存元数据，不存密钥、请求头或内容载荷。"""

    __tablename__ = "lin_agent_audit_log"

    id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    agent_token_id: Mapped[int | None] = mapped_column(Integer(), default=None, index=True)
    user_id: Mapped[int] = mapped_column(Integer(), nullable=False, index=True)
    content_type_key: Mapped[str | None] = mapped_column(String(80), default=None)
    record_id: Mapped[int | None] = mapped_column(Integer(), default=None)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    success: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=True)
    error_code: Mapped[int | None] = mapped_column(Integer(), default=None)
    request_id: Mapped[str | None] = mapped_column(String(64), default=None)
    detail: Mapped[str | None] = mapped_column(Text(), default=None)
    create_time: Mapped[datetime] = mapped_column(DateTime(), server_default=func.now(), nullable=False, index=True)
