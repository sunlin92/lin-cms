"""分组与权限服务。"""

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.errors import Forbidden, NotFound
from app.core.permissions import GUEST_LEVEL, ROOT_LEVEL
from app.models import Group, Log, User
from app.repositories import group_repo
from app.schemas.admin import GroupBaseIn, GroupCreateIn


def all_groups_payload(db: Session) -> list[dict]:
    return [{"id": g.id, "name": g.name, "info": g.info} for g in group_repo.all_non_root_groups(db)]


def group_detail_payload(db: Session, gid: int) -> dict:
    group = group_repo.get_group(db, gid)
    if group is None:
        raise NotFound("分组不存在")
    permissions = group_repo.permissions_of_group(db, gid)
    return {
        "id": group.id,
        "name": group.name,
        "info": group.info,
        "permissions": [{"id": p.id, "name": p.name, "module": p.module, "mount": p.mount} for p in permissions],
    }


def permissions_grouped_payload(db: Session) -> dict:
    grouped: dict[str, list[dict]] = {}
    for perm in group_repo.all_mounted_permissions(db):
        grouped.setdefault(perm.module, []).append(
            {"id": perm.id, "name": perm.name, "module": perm.module, "mount": perm.mount}
        )
    return grouped


def create_group(db: Session, payload: GroupCreateIn, request: Request, operator: User) -> Group:
    if group_repo.group_by_name(db, payload.name) is not None:
        raise Forbidden("分组已存在，不可创建同名分组")
    group = group_repo.create_group(db, name=payload.name, info=payload.info)
    group_repo.add_group_permissions(db, group.id, payload.permission_ids)
    _log(db, request, operator, "管理员新建了一个分组")
    return group


def update_group(db: Session, gid: int, payload: GroupBaseIn) -> None:
    group = group_repo.get_group(db, gid)
    if group is None:
        raise NotFound("分组不存在，更新失败")
    if payload.name != group.name and group_repo.group_by_name(db, payload.name) is not None:
        raise Forbidden("分组已存在，不可创建同名分组")
    group.name = payload.name
    group.info = payload.info
    db.flush()


def delete_group(db: Session, gid: int, request: Request, operator: User) -> None:
    group = group_repo.get_group(db, gid)
    if group is None:
        raise NotFound("分组不存在，删除失败")
    if group.level in (ROOT_LEVEL, GUEST_LEVEL):
        raise Forbidden("不可删除此分组")
    if group_repo.has_users(db, gid):
        raise Forbidden("分组下存在用户，不可删除")
    _log(db, request, operator, "管理员删除了一个分组")
    group_repo.delete_group_cascade(db, group)


def dispatch_permissions(db: Session, gid: int, permission_ids: list[int]) -> None:
    group_repo.add_group_permissions(db, gid, permission_ids)


def remove_permissions(db: Session, gid: int, permission_ids: list[int]) -> None:
    group_repo.remove_group_permissions(db, gid, permission_ids)


def _log(db: Session, request: Request, operator: User, message: str) -> None:
    db.add(
        Log(
            message=message,
            user_id=operator.id,
            username=operator.username,
            status_code=200,
            method=request.method,
            path=request.url.path,
            permission="",
        )
    )
    db.flush()
