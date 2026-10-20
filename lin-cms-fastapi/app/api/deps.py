"""API 依赖：认证（JWT）、Root、挂载权限校验。"""

from dataclasses import dataclass

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.errors import APIException, NotFound, UnAuthentication
from app.core.permissions import PermissionMeta, group_ids_of_user, is_root_user
from app.core.security import TokenService
from app.db.session import get_db
from app.models import User
from app.services import auth_service


@dataclass
class CurrentAuth:
    user: User
    claims: dict


@dataclass
class UserSessionPrincipal:
    """浏览器会话主体：内容能力 = 分组授权并集（Root 标志不构成内容旁路）。"""

    user_id: int
    is_root: bool


@dataclass
class AgentTokenPrincipal:
    """Agent Token 主体：刻意不携带 Root 标志与系统权限（docs/04 §4.3）。"""

    token_id: int
    user_id: int
    token_name: str


def get_agent_principal(request: Request, db: Session = Depends(get_db)) -> AgentTokenPrincipal:
    """解析 Authorization: Bearer lin_agent_...；复用 agent_token_service.authenticate。"""
    from app.core.errors import UnAuthentication
    from app.services import agent_token_service

    header = request.headers.get("authorization") or ""
    if not header.startswith("Bearer lin_agent_"):
        raise UnAuthentication("需要 Agent Token 认证")
    plaintext = header.removeprefix("Bearer ").strip()
    try:
        token = agent_token_service.authenticate(db, plaintext)
    except APIException as exc:
        raise UnAuthentication(exc.message) from exc
    return AgentTokenPrincipal(token_id=token.id, user_id=token.user_id, token_name=token.name)


def get_content_principal(
    request: Request, db: Session = Depends(get_db)
) -> UserSessionPrincipal | AgentTokenPrincipal:
    """内容 API 统一主体：Bearer lin_agent_ 走 Agent 认证，其余走浏览器 JWT。"""
    header = request.headers.get("authorization") or ""
    if header.startswith("Bearer lin_agent_"):
        return get_agent_principal(request, db)
    auth = get_current_auth(request, db, get_token_service(request))
    return UserSessionPrincipal(user_id=auth.user.id, is_root=is_root_user(db, auth.user.id))


def get_token_service(request: Request) -> TokenService:
    return request.app.state.tokens


def get_current_auth(
    request: Request, db: Session = Depends(get_db), tokens: TokenService = Depends(get_token_service)
) -> CurrentAuth:
    header = request.headers.get("authorization") or ""
    if not header.startswith("Bearer "):
        raise UnAuthentication("认证失败，请检查请求头或者重新登录")
    token = header.removeprefix("Bearer ").strip()
    claims = tokens.decode(token, expected_type="access")
    if auth_service.revoked_jti(db, claims["jti"]):
        raise UnAuthentication("令牌已吊销，请重新登录")
    user = db.get(User, int(claims["sub"]))
    if user is None:
        raise NotFound("用户不存在")
    if claims.get("ver", 0) != user.token_version:
        raise UnAuthentication("登录凭证已失效，请重新登录")
    return CurrentAuth(user=user, claims=claims)


def get_current_user(auth: CurrentAuth = Depends(get_current_auth)) -> User:
    return auth.user


def require_root(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> User:
    if not is_root_user(db, user.id):
        raise UnAuthentication("只有超级管理员可操作")
    return user


def require_permission(meta: PermissionMeta):
    """依赖工厂：Root 旁路；普通用户按分组权限判定。"""

    def _checker(
        request: Request,  # noqa: ARG001
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> User:
        from app.repositories import group_repo

        if is_root_user(db, user.id):
            return user
        gids = group_ids_of_user(db, user.id)
        if not gids:
            raise UnAuthentication("您还不属于任何分组，请联系超级管理员获得权限")
        if not group_repo.user_has_permission(db, gids, name=meta.name, module=meta.module):
            raise UnAuthentication("权限不够，请联系超级管理员获得权限")
        return user

    return _checker


__all__ = [
    "APIException",
    "AgentTokenPrincipal",
    "CurrentAuth",
    "UserSessionPrincipal",
    "get_agent_principal",
    "get_content_principal",
    "get_current_auth",
    "get_current_user",
    "get_token_service",
    "require_permission",
    "require_root",
]
