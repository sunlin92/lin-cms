"""模型基类：时间戳与软删除（deleted_token 模式，跨 SQLite/PostgreSQL/MySQL 一致）。

软删除约定：deleted_token=0 表示活跃；删除时置为该行 id 并记录 deleted_at。
唯一约束使用 (业务键, deleted_token)，避免依赖数据库部分索引。
"""

from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    create_time: Mapped[datetime] = mapped_column(DateTime(), server_default=func.now(), nullable=False)
    update_time: Mapped[datetime] = mapped_column(
        DateTime(), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class SoftDeleteMixin:
    deleted_token: Mapped[int] = mapped_column(default=0, nullable=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(), default=None)

    def soft_delete(self) -> None:
        self.deleted_token = self.id
        self.deleted_at = datetime.utcnow()
