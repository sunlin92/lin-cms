"""认证与个人资料相关 schema（字段名与旧契约一致）。"""

import re
from typing import Annotated

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.errors import ParameterError

UsernameStr = Field(min_length=2, max_length=10, description="用户名")
PasswordStr = Field(min_length=6, max_length=22, description="密码 6-22 位")
_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{2,10}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _check_username(value: str) -> str:
    if not _USERNAME_RE.match(value):
        raise ParameterError("用户名只能由字母、数字、下划线组成，且长度为2-10位")
    return value


def _check_email(value: str | None) -> str | None:
    if value and not _EMAIL_RE.match(value):
        raise ParameterError("邮箱格式不正确")
    return value


class LoginIn(BaseModel):
    username: str
    password: str
    captcha: str | None = None


class TokenPairOut(BaseModel):
    access_token: str
    refresh_token: str


class CaptchaOut(BaseModel):
    tag: str = ""
    image: str = ""


class LogoutIn(BaseModel):
    refresh_token: str | None = None


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: Annotated[str, PasswordStr]
    confirm_password: Annotated[str, PasswordStr]

    @model_validator(mode="after")
    def _match(self) -> "ChangePasswordIn":
        if self.new_password != self.confirm_password:
            raise ParameterError("两次输入的密码不一致，请输入相同的密码")
        return self


class ResetPasswordIn(BaseModel):
    new_password: Annotated[str, PasswordStr]
    confirm_password: Annotated[str, PasswordStr]

    @model_validator(mode="after")
    def _match(self) -> "ResetPasswordIn":
        if self.new_password != self.confirm_password:
            raise ParameterError("两次输入的密码不一致，请输入相同的密码")
        return self


class ProfileUpdateIn(BaseModel):
    email: str | None = None
    nickname: str | None = Field(None, min_length=2, max_length=10)
    avatar: str | None = None

    @field_validator("email")
    @classmethod
    def _email(cls, value: str | None) -> str | None:
        return _check_email(value)


class UserOut(BaseModel):
    id: int
    username: str
    nickname: str | None = None
    email: str | None = None
    avatar: str | None = None


class RegisterIn(BaseModel):
    username: str = UsernameStr
    password: Annotated[str, PasswordStr]
    confirm_password: Annotated[str, PasswordStr]
    email: str | None = None
    group_ids: list[int] = Field(default_factory=list)

    @field_validator("username")
    @classmethod
    def _username(cls, value: str) -> str:
        return _check_username(value)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str | None) -> str | None:
        return _check_email(value)

    @field_validator("group_ids")
    @classmethod
    def _group_ids(cls, value: list[int]) -> list[int]:
        if any(gid <= 0 for gid in value):
            raise ParameterError("用户组ID必须大于0")
        return value

    @model_validator(mode="after")
    def _match(self) -> "RegisterIn":
        if self.password != self.confirm_password:
            raise ParameterError("两次输入的密码不一致，请输入相同的密码")
        return self
