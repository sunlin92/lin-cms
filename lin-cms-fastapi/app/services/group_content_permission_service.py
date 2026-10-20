"""分组动态内容授权服务：全量替换与用户能力并集（docs/04 §3.3/§4.2）。

替换语义：遗漏即撤销；空操作集条目跳过不落库。用户有效能力 = 全部分组授权并集。
"""

from sqlalchemy.orm import Session

from app.core.errors import NotFound
from app.models import ContentType, Group, GroupContentPermission, UserGroup

OPS = ("can_read", "can_create", "can_update", "can_delete")


def _require_group(db: Session, group_id: int) -> Group:
    group = db.query(Group).filter(Group.id == group_id, Group.deleted_token == 0).first()
    if group is None:
        raise NotFound("分组不存在")
    return group


def get_group_grants(db: Session, group_id: int) -> list[GroupContentPermission]:
    _require_group(db, group_id)
    return (
        db.query(GroupContentPermission)
        .filter(GroupContentPermission.group_id == group_id)
        .order_by(GroupContentPermission.content_type_id)
        .all()
    )


def replace_group_grants(db: Session, group_id: int, entries: list[dict]) -> None:
    """整体事务化全量替换；调用方负责 commit。entries 元素含 content_type_id 与布尔操作。"""
    _require_group(db, group_id)
    valid_type_ids = {row.id for row in db.query(ContentType.id).filter(ContentType.status == "active").all()}
    normalized: list[dict] = []
    for entry in entries:
        type_id = entry["content_type_id"]
        if type_id not in valid_type_ids:
            raise NotFound(f"内容类型不存在或已归档：{type_id}")
        ops = {op: bool(entry.get(op, False)) for op in OPS}
        if any(ops.values()):
            normalized.append({"content_type_id": type_id, **ops})

    db.query(GroupContentPermission).filter(GroupContentPermission.group_id == group_id).delete()
    for item in normalized:
        db.add(GroupContentPermission(group_id=group_id, **item))
    db.flush()


def grants_payload(db: Session, group_id: int) -> dict:
    rows = get_group_grants(db, group_id)
    return {
        "entries": [
            {
                "content_type_id": row.content_type_id,
                "can_read": row.can_read,
                "can_create": row.can_create,
                "can_update": row.can_update,
                "can_delete": row.can_delete,
            }
            for row in rows
        ]
    }


def user_caps(db: Session, user_id: int, content_type_id: int) -> set[str]:
    """用户对指定内容类型的有效操作并集（模型须 active）。"""
    rows = (
        db.query(GroupContentPermission)
        .join(UserGroup, UserGroup.group_id == GroupContentPermission.group_id)
        .join(ContentType, ContentType.id == GroupContentPermission.content_type_id)
        .filter(
            UserGroup.user_id == user_id,
            GroupContentPermission.content_type_id == content_type_id,
            ContentType.status == "active",
        )
        .all()
    )
    caps: set[str] = set()
    for row in rows:
        if row.can_read:
            caps.add("read")
        if row.can_create:
            caps.add("create")
        if row.can_update:
            caps.add("update")
        if row.can_delete:
            caps.add("delete")
    return caps
