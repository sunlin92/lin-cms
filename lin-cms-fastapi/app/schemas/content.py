"""日志与图书 schema。"""

import re

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import QueryPage

_DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$")


class LogQueryIn(QueryPage):
    keyword: str | None = None
    name: str | None = None
    start: str | None = None
    end: str | None = None

    @field_validator("start", "end")
    @classmethod
    def _datetime(cls, value: str | None) -> str | None:
        if value is None or _DATETIME_RE.match(value):
            return value
        raise ValueError("时间格式有误")


class LogOut(BaseModel):
    id: int
    message: str | None = None
    user_id: int
    username: str | None = None
    status_code: int | None = None
    method: str | None = None
    path: str | None = None
    permission: str | None = None
    time: str | None = None


class LogPageOut(BaseModel):
    items: list[LogOut]
    count: int
    page: int
    total: int
    total_page: int


class UsernameListOut(BaseModel):
    items: list[str]


class BookIn(BaseModel):
    title: str = Field(min_length=1, max_length=50)
    author: str = Field(min_length=1, max_length=30)
    image: str = Field(min_length=1, max_length=100)
    summary: str = Field(min_length=1, max_length=1000)


class BookOut(BaseModel):
    id: int
    title: str
    author: str
    image: str | None = None
    summary: str | None = None


class BookSearchIn(BaseModel):
    q: str = ""
