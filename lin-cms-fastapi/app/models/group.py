"""分组域模型：分组（软删除）、分组-权限关联、权限（启动同步管理）。"""

from sqlalchemy import Boolean, Integer, SmallInteger, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class Group(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "lin_group"
    __table_args__ = (UniqueConstraint("name", "deleted_token", name="uq_group_name_alive"),)

    id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    info: Mapped[str | None] = mapped_column(String(255))
    # 1 ROOT / 2 GUEST / 3 USER
    level: Mapped[int] = mapped_column(SmallInteger(), default=3, nullable=False)


class GroupPermission(Base):
    __tablename__ = "lin_group_permission"
    __table_args__ = (UniqueConstraint("group_id", "permission_id", name="uq_group_permission"),)

    id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(Integer(), nullable=False, index=True)
    permission_id: Mapped[int] = mapped_column(Integer(), nullable=False)


class Permission(TimestampMixin, Base):
    __tablename__ = "lin_permission"
    __table_args__ = (UniqueConstraint("name", "module", name="uq_permission_name_module"),)

    id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    module: Mapped[str] = mapped_column(String(50), nullable=False)
    mount: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=True)
