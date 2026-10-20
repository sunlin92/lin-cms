"""权限注册表与启动同步。

权限以 (module, name) 唯一标识，集中声明（Registry 模式），启动时与 lin_permission 表做幂等同步：
代码有/库无 → 插入；mount 不一致 → 更新；库有/代码无 → 删除并清理分组关联。
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Group, GroupPermission, Permission, UserGroup


@dataclass(frozen=True)
class PermissionMeta:
    name: str
    module: str
    mount: bool


def _user_module() -> list[PermissionMeta]:
    names = [
        "注册",
        "用户更新信息",
        "修改密码",
        "查询自己信息",
        "刷新令牌",
        "退出登录",
        "查询自己拥有的权限",
        "获取图形验证码",
    ]
    return [PermissionMeta(name=n, module="用户", mount=False) for n in names]


def _admin_module() -> list[PermissionMeta]:
    names = [
        "查询所有可分配的权限",
        "查询所有用户",
        "修改用户密码",
        "删除用户",
        "管理员更新用户信息",
        "查询所有分组",
        "查询一个分组及其权限",
        "新建分组",
        "更新一个分组",
        "删除一个分组",
        "分配多个权限",
        "删除多个权限",
    ]
    return [PermissionMeta(name=n, module="管理员", mount=False) for n in names]


LOG_VIEW = PermissionMeta("查询日志", "日志", True)
LOG_SEARCH = PermissionMeta("搜索日志", "日志", True)
LOG_USERS = PermissionMeta("查询日志记录的用户", "日志", True)
BOOK_DELETE = PermissionMeta("删除图书", "图书", True)

# 全量权限注册表：与旧实现逐条对齐，共 24 条
PERMISSION_REGISTRY: list[PermissionMeta] = [
    *_user_module(),
    *_admin_module(),
    LOG_VIEW,
    LOG_SEARCH,
    LOG_USERS,
    BOOK_DELETE,
]


def sync_permissions(db: Session) -> None:
    """幂等同步；须在事务中调用。"""
    rows = list(db.scalars(select(Permission)))
    by_key = {(row.module, row.name): row for row in rows}
    kept_ids: set[int] = set()

    for meta in PERMISSION_REGISTRY:
        row = by_key.get((meta.module, meta.name))
        if row is None:
            db.add(Permission(name=meta.name, module=meta.module, mount=meta.mount))
        else:
            if row.mount != meta.mount:
                row.mount = meta.mount
            kept_ids.add(row.id)

    stale_ids = [row.id for row in rows if row.id not in kept_ids]
    if stale_ids:
        for row in (r for r in rows if r.id in stale_ids):
            db.delete(row)
        links = db.scalars(select(GroupPermission).where(GroupPermission.permission_id.in_(stale_ids)))
        for link in links:
            db.delete(link)
    db.flush()


ROOT_LEVEL = 1
GUEST_LEVEL = 2


def group_ids_of_user(db: Session, user_id: int) -> list[int]:
    stmt = (
        select(Group.id)
        .join(UserGroup, UserGroup.group_id == Group.id)
        .where(UserGroup.user_id == user_id, Group.deleted_token == 0)
    )
    return list(db.scalars(stmt))


def is_root_user(db: Session, user_id: int) -> bool:
    stmt = (
        select(Group.id)
        .join(UserGroup, UserGroup.group_id == Group.id)
        .where(UserGroup.user_id == user_id, Group.deleted_token == 0, Group.level == ROOT_LEVEL)
        .limit(1)
    )
    return db.scalar(stmt) is not None


def guest_group_id(db: Session) -> int:
    gid = db.scalar(select(Group.id).where(Group.level == GUEST_LEVEL, Group.deleted_token == 0))
    if gid is None:
        from app.core.errors import NotFound

        raise NotFound("默认分组（Guest）不存在，请先初始化数据库")
    return gid
