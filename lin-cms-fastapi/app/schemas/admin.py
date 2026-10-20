"""管理员域 schema：用户分页/更新、分组 CRUD、权限分发。"""

from pydantic import BaseModel, Field, field_validator

from app.core.errors import ParameterError
from app.schemas.common import QueryPage


class AdminGroupOut(BaseModel):
    id: int
    name: str
    info: str | None = None


class AdminUserOut(BaseModel):
    id: int
    username: str
    email: str | None = None
    groups: list[AdminGroupOut]


class AdminUserPageQuery(QueryPage):
    group_id: int | None = None


class AdminUserPageOut(BaseModel):
    items: list[AdminUserOut]
    count: int
    page: int
    total: int
    total_page: int


class AdminUserUpdateIn(BaseModel):
    email: str | None = None
    group_ids: list[int]

    @field_validator("group_ids")
    @classmethod
    def _group_ids(cls, value: list[int]) -> list[int]:
        if any(gid <= 0 for gid in value):
            raise ParameterError("用户组ID必须大于0")
        return value


class GroupBaseIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    info: str | None = Field(None, max_length=255)


class GroupCreateIn(GroupBaseIn):
    permission_ids: list[int]

    @field_validator("permission_ids")
    @classmethod
    def _permission_ids(cls, value: list[int]) -> list[int]:
        if any(pid <= 0 for pid in value):
            raise ParameterError("权限ID必须大于0")
        return value


class PermissionOut(BaseModel):
    id: int
    name: str
    module: str
    mount: bool


class GroupDetailOut(AdminGroupOut):
    permissions: list[PermissionOut]


class GroupPermissionDispatchIn(BaseModel):
    group_id: int
    permission_ids: list[int]

    @field_validator("permission_ids")
    @classmethod
    def _permission_ids(cls, value: list[int]) -> list[int]:
        if any(pid <= 0 for pid in value):
            raise ParameterError("权限ID必须大于0")
        return value
