"""用户域模型：用户（硬删除）、身份凭证、用户-分组关联。"""

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class User(TimestampMixin, Base):
    __tablename__ = "lin_user"

    id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(24), nullable=False, unique=True)
    nickname: Mapped[str | None] = mapped_column(String(24))
    email: Mapped[str | None] = mapped_column(String(100), unique=True)
    avatar: Mapped[str | None] = mapped_column(String(500))
    token_version: Mapped[int] = mapped_column(Integer(), default=0, nullable=False)


class UserIdentity(TimestampMixin, Base):
    __tablename__ = "lin_user_identity"

    id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer(), nullable=False, index=True)
    identity_type: Mapped[str] = mapped_column(String(100), nullable=False, default="USERNAME_PASSWORD")
    identifier: Mapped[str | None] = mapped_column(String(100))
    credential: Mapped[str | None] = mapped_column(String(255))


class UserGroup(Base):
    __tablename__ = "lin_user_group"

    id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer(), nullable=False)
    group_id: Mapped[int] = mapped_column(Integer(), nullable=False)
