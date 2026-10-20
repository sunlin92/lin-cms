"""用户服务：注册（管理员建用户）、资料、改密、管理员用户管理、权限清单。"""

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import (
    Duplicated,
    Failed,
    Forbidden,
    GroupAssignInvalid,
    NotFound,
    ParameterError,
    RootGroupAddForbidden,
    RootUserGroupLocked,
)
from app.core.permissions import ROOT_LEVEL, guest_group_id, is_root_user
from app.core.security import password_hasher
from app.models import Log, User
from app.repositories import group_repo, user_repo
from app.schemas.admin import AdminUserPageQuery, AdminUserUpdateIn
from app.schemas.user import ProfileUpdateIn, RegisterIn
from app.services.auth_service import avatar_url


def _resolve_group_ids(db: Session, group_ids: list[int]) -> list[int]:
    """默认落入 Guest 组；校验存在性并拒绝 Root 组。"""
    ids = group_ids or [guest_group_id(db)]
    for gid in ids:
        group = group_repo.get_group(db, gid)
        if group is None:
            raise GroupAssignInvalid()
        if group.level == ROOT_LEVEL:
            raise RootGroupAddForbidden()
    return ids


def register_user(db: Session, payload: RegisterIn, request: Request) -> User:
    if user_repo.get_by_username(db, payload.username) is not None:
        raise Duplicated("用户名重复，请重新输入")
    if payload.email and user_repo.get_by_email(db, payload.email) is not None:
        raise Duplicated("注册邮箱重复，请重新输入")

    group_ids = _resolve_group_ids(db, payload.group_ids)
    user = user_repo.create_user(db, username=payload.username, email=payload.email or None)
    user_repo.set_password(db, user, payload.password)
    user_repo.replace_user_groups(db, user.id, group_ids)
    _log(db, request, user, "管理员新建了一个用户")
    return user


def user_payload(db: Session, settings: Settings, request: Request, user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "nickname": user.nickname,
        "email": user.email,
        "avatar": avatar_url(settings, request, user.avatar),
    }


def permissions_payload(db: Session, settings: Settings, request: Request, user: User) -> dict:
    groups = user_repo.groups_of(db, user.id)
    grouped: dict[str, list[dict]] = {}
    for group in groups:
        for perm in group_repo.permissions_of_group(db, group.id):
            grouped.setdefault(perm.module, []).append({"permission": perm.name, "module": perm.module})
    payload = user_payload(db, settings, request, user)
    payload["admin"] = is_root_user(db, user.id)
    payload["permissions"] = [{module: items} for module, items in grouped.items()]
    return payload


def update_profile(db: Session, user: User, payload: ProfileUpdateIn) -> None:
    if payload.email and payload.email != user.email:
        if user_repo.get_by_email(db, payload.email) is not None:
            raise ParameterError("邮箱已被注册，请重新输入邮箱")
        user.email = payload.email
    if payload.nickname is not None:
        user.nickname = payload.nickname
    if payload.avatar is not None:
        user.avatar = payload.avatar
    db.flush()


def change_password(db: Session, user: User, *, old_password: str, new_password: str, request: Request) -> None:
    stored = user_repo.credential_of(db, user.id)
    if not stored or not password_hasher.verify(old_password, stored):
        raise Failed("修改密码失败")
    user_repo.set_password(db, user, new_password)
    from app.services import agent_token_service

    agent_token_service.revoke_all_for_user(db, user.id, reason="password_changed")
    _log(db, request, user, f"{user.username}修改了自己的密码")


def page_users(db: Session, query: AdminUserPageQuery) -> dict:
    total, rows = user_repo.page_non_root_users(db, count=query.count, offset=query.offset, group_id=query.group_id)
    items = [
        {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "groups": [{"id": g.id, "name": g.name, "info": g.info} for g in groups],
        }
        for user, groups in rows
    ]
    total_page = (total + query.count - 1) // query.count if total else 0
    return {
        "items": items,
        "count": query.count,
        "page": query.page,
        "total": total,
        "total_page": total_page,
    }


def admin_update_user(db: Session, uid: int, payload: AdminUserUpdateIn) -> None:
    user = user_repo.get_by_id(db, uid)
    if user is None:
        raise NotFound("用户不存在")
    if payload.email and payload.email != user.email:
        if user_repo.get_by_email(db, payload.email) is not None:
            raise ParameterError("邮箱已被注册，请重新输入邮箱")
        user.email = payload.email
    if is_root_user(db, uid):
        raise RootUserGroupLocked()
    group_ids = _resolve_group_ids(db, payload.group_ids)
    user_repo.replace_user_groups(db, uid, group_ids)


def admin_reset_password(db: Session, uid: int, new_password: str) -> None:
    user = user_repo.get_by_id(db, uid)
    if user is None:
        raise NotFound("用户不存在")
    user_repo.set_password(db, user, new_password)
    from app.services import agent_token_service

    agent_token_service.revoke_all_for_user(db, uid, reason="password_reset")


def admin_delete_user(db: Session, uid: int, request: Request) -> None:
    user = user_repo.get_by_id(db, uid)
    if user is None:
        raise NotFound("用户不存在")
    if is_root_user(db, uid):
        raise Forbidden("无法删除此用户")
    _log(db, request, user, "管理员删除了一个用户")
    from app.services import agent_token_service

    agent_token_service.delete_all_for_user(db, uid)
    user_repo.delete_user_cascade(db, user)


def _log(db: Session, request: Request, user: User, message: str) -> None:
    db.add(
        Log(
            message=message,
            user_id=user.id,
            username=user.username,
            status_code=200,
            method=request.method,
            path=request.url.path,
            permission="",
        )
    )
    db.flush()
