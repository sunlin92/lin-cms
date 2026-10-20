"""行为日志（追加写）与令牌黑名单。"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Log(Base):
    __tablename__ = "lin_log"

    id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    message: Mapped[str | None] = mapped_column(String(450))
    user_id: Mapped[int] = mapped_column(Integer(), nullable=False)
    username: Mapped[str | None] = mapped_column(String(24))
    status_code: Mapped[int | None] = mapped_column(Integer())
    method: Mapped[str | None] = mapped_column(String(20))
    path: Mapped[str | None] = mapped_column(String(50))
    permission: Mapped[str | None] = mapped_column(String(100))
    create_time: Mapped[datetime] = mapped_column(DateTime(), server_default=func.now(), nullable=False, index=True)


class TokenBlocklist(Base):
    __tablename__ = "lin_token_blocklist"

    id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    jti: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer())
    expires_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False, index=True)
