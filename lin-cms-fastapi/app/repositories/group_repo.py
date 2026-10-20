"""分组与权限仓储。"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.permissions import ROOT_LEVEL
from app.models import Group, GroupPermission, Permission, UserGroup


def get_group(db: Session, gid: int) -> Group | None:
    return db.scalar(select(Group).where(Group.id == gid, Group.deleted_token == 0))


def get_any_group(db: Session, gid: int) -> Group | None:
    return db.get(Group, gid)


def group_by_name(db: Session, name: str) -> Group | None:
    return db.scalar(select(Group).where(Group.name == name, Group.deleted_token == 0))


def group_by_level(db: Session, level: int) -> Group | None:
    return db.scalar(select(Group).where(Group.level == level, Group.deleted_token == 0))


def all_non_root_groups(db: Session) -> list[Group]:
    return list(db.scalars(select(Group).where(Group.deleted_token == 0, Group.level != ROOT_LEVEL).order_by(Group.id)))


def create_group(db: Session, *, name: str, info: str | None) -> Group:
    group = Group(name=name, info=info)
    db.add(group)
    db.flush()
    return group


def has_users(db: Session, gid: int) -> bool:
    return db.scalar(select(func.count()).select_from(UserGroup).where(UserGroup.group_id == gid)) > 0


def delete_group_cascade(db: Session, group: Group) -> None:
    db.query(GroupPermission).filter(GroupPermission.group_id == group.id).delete()
    group.soft_delete()
    db.flush()


def permissions_of_group(db: Session, gid: int) -> list[Permission]:
    """分组的已分配权限（仅 mount=True 可见/生效）。"""
    stmt = (
        select(Permission)
        .join(GroupPermission, GroupPermission.permission_id == Permission.id)
        .where(GroupPermission.group_id == gid, Permission.mount.is_(True))
        .order_by(Permission.id)
    )
    return list(db.scalars(stmt))


def all_mounted_permissions(db: Session) -> list[Permission]:
    return list(db.scalars(select(Permission).where(Permission.mount.is_(True)).order_by(Permission.id)))


def group_permission_ids(db: Session, gid: int) -> set[int]:
    stmt = select(GroupPermission.permission_id).where(GroupPermission.group_id == gid)
    return set(db.scalars(stmt))


def add_group_permissions(db: Session, gid: int, permission_ids: list[int]) -> None:
    existing = group_permission_ids(db, gid)
    for pid in permission_ids:
        if pid not in existing:
            db.add(GroupPermission(group_id=gid, permission_id=pid))
    db.flush()


def remove_group_permissions(db: Session, gid: int, permission_ids: list[int]) -> None:
    if permission_ids:
        db.query(GroupPermission).filter(
            GroupPermission.group_id == gid,
            GroupPermission.permission_id.in_(permission_ids),
        ).delete(synchronize_session=False)
    db.flush()


def user_has_permission(db: Session, group_ids: list[int], *, name: str, module: str) -> bool:
    stmt = (
        select(Permission.id)
        .join(GroupPermission, GroupPermission.permission_id == Permission.id)
        .where(
            GroupPermission.group_id.in_(group_ids),
            Permission.name == name,
            Permission.module == module,
            Permission.mount.is_(True),
        )
        .limit(1)
    )
    return db.scalar(stmt) is not None


def all_permissions(db: Session) -> list[Permission]:
    return list(db.scalars(select(Permission).order_by(Permission.id)))
