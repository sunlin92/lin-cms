"""可配置内容模型：类型定义、内容记录与分组动态内容授权（docs/04 §3.1-§3.3）。"""

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class ContentType(TimestampMixin, Base):
    """内容类型：声明式字段 schema，配置数据驱动，不属于代码权限注册表。"""

    __tablename__ = "lin_content_type"

    id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    schema_json: Mapped[str] = mapped_column(Text(), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="active", nullable=False)


class ContentRecord(TimestampMixin, SoftDeleteMixin, Base):
    """内容记录：按类型 schema 校验的 JSON 文档，软删除跨库一致。"""

    __tablename__ = "lin_content_record"

    id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    content_type_id: Mapped[int] = mapped_column(
        Integer(), ForeignKey("lin_content_type.id"), nullable=False, index=True
    )
    data_json: Mapped[str] = mapped_column(Text(), nullable=False)


class GroupContentPermission(TimestampMixin, Base):
    """分组动态内容授权：无记录即全部禁止；启动权限同步永不清除本表数据。"""

    __tablename__ = "lin_group_content_permission"
    __table_args__ = (UniqueConstraint("group_id", "content_type_id", name="uq_group_content_type"),)

    id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(Integer(), ForeignKey("lin_group.id"), nullable=False, index=True)
    content_type_id: Mapped[int] = mapped_column(
        Integer(), ForeignKey("lin_content_type.id"), nullable=False, index=True
    )
    can_read: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    can_create: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    can_update: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
    can_delete: Mapped[bool] = mapped_column(Boolean(), default=False, nullable=False)
