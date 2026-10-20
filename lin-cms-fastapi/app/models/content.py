"""文件（软删除，MD5 去重）与图书（软删除）示例业务模型。"""

from sqlalchemy import Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class FileRecord(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "lin_file"
    __table_args__ = (UniqueConstraint("md5", "deleted_token", name="uq_file_md5_alive"),)

    id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    path: Mapped[str] = mapped_column(String(500), nullable=False)
    type: Mapped[str] = mapped_column(String(10), default="LOCAL", nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    extension: Mapped[str | None] = mapped_column(String(50))
    size: Mapped[int | None] = mapped_column(Integer())
    md5: Mapped[str | None] = mapped_column(String(40), index=True)


class Book(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "lin_book"

    id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    author: Mapped[str] = mapped_column(String(30), default="未名")
    summary: Mapped[str | None] = mapped_column(Text())
    image: Mapped[str | None] = mapped_column(String(100))
