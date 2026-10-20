"""通用 schema：信封、分页（0-based page，count 1..15）。"""

from typing import Any

from pydantic import BaseModel, Field


class Envelope(BaseModel):
    message: str
    code: int
    request: str


class QueryPage(BaseModel):
    count: int = Field(5, gt=0, le=15, description="0 < count <= 15")
    page: int = Field(0, ge=0)

    @property
    def offset(self) -> int:
        return self.count * self.page


class PageOut(BaseModel):
    items: list[Any]
    count: int
    page: int
    total: int
    total_page: int
