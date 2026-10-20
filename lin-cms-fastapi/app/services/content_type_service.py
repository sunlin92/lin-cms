"""内容类型管理服务：CRUD、schema 演进保护、归档/恢复（docs/04 §3.1/§5.1）。

破坏性变更防护：更新 schema 时把该类型全部活跃记录逐条用新 schema 重校验，
任一失败即拒绝（规格 §3.2「若会令已有记录无效则拒绝」）。
"""

import json

from sqlalchemy.orm import Session

from app.core.errors import ContentSchemaBreaking, ContentTypeNotFound, Duplicated, ParameterError
from app.models import ContentRecord, ContentType, Group, GroupContentPermission, UserGroup
from app.schemas.content_type import (
    ContentTypeCreate,
    ContentTypeUpdate,
    FieldSpec,
    field_specs_to_json,
    parse_schema_json,
    validate_record_data,
    validate_type_key,
    validate_type_schema,
)

ACTIVE = "active"
ARCHIVED = "archived"


def get_type(db: Session, type_id: int) -> ContentType:
    item = db.get(ContentType, type_id)
    if item is None:
        raise ContentTypeNotFound()
    return item


def get_active_type_by_key(db: Session, key: str) -> ContentType:
    item = db.query(ContentType).filter(ContentType.key == key, ContentType.status == ACTIVE).first()
    if item is None:
        raise ContentTypeNotFound()
    return item


def create_type(db: Session, payload: ContentTypeCreate, *, max_fields: int) -> ContentType:
    key = validate_type_key(payload.key)
    if db.query(ContentType).filter(ContentType.key == key).first() is not None:
        raise Duplicated(f"内容类型 key 已存在：{key}")
    specs = validate_type_schema(payload.fields, max_fields=max_fields)
    item = ContentType(
        key=key,
        name=payload.name,
        description=payload.description,
        schema_json=field_specs_to_json(specs),
        status=ACTIVE,
    )
    db.add(item)
    db.flush()
    return item


def _assert_schema_compatible(db: Session, item: ContentType, specs: list[FieldSpec]) -> None:
    """存量活跃记录逐条用新 schema 重校验；失败给出首个失败记录与数量。"""
    records = (
        db.query(ContentRecord).filter(ContentRecord.content_type_id == item.id, ContentRecord.deleted_token == 0).all()
    )
    broken: int = 0
    first_bad: int | None = None
    for record in records:
        try:
            validate_record_data(item.key, specs, json.loads(record.data_json))
        except Exception:
            broken += 1
            if first_bad is None:
                first_bad = record.id
    if broken:
        raise ContentSchemaBreaking(
            f"有 {broken} 条存量记录不符合新 schema（首条记录 id={first_bad}），请先补齐数据或保持兼容"
        )


def update_type(db: Session, type_id: int, payload: ContentTypeUpdate, *, max_fields: int) -> ContentType:
    item = get_type(db, type_id)
    specs = validate_type_schema(payload.fields, max_fields=max_fields)
    _assert_schema_compatible(db, item, specs)
    item.name = payload.name
    item.description = payload.description
    item.schema_json = field_specs_to_json(specs)
    db.flush()
    return item


def set_status(db: Session, type_id: int, status: str) -> ContentType:
    item = get_type(db, type_id)
    if item.status == status:
        raise ParameterError("内容类型已处于该状态")
    item.status = status
    db.flush()
    return item


def count_records(db: Session, type_id: int) -> int:
    return (
        db.query(ContentRecord)
        .filter(ContentRecord.content_type_id == type_id, ContentRecord.deleted_token == 0)
        .count()
    )


def _specs_of(item: ContentType) -> list[FieldSpec]:
    return parse_schema_json(item.schema_json)


def detail_payload(db: Session, type_id: int) -> dict:
    item = get_type(db, type_id)
    return {
        "id": item.id,
        "key": item.key,
        "name": item.name,
        "description": item.description,
        "status": item.status,
        "fields": [spec.model_dump(mode="json", exclude_none=True, by_alias=True) for spec in _specs_of(item)],
        "record_count": count_records(db, item.id),
        "create_time": item.create_time.isoformat() if item.create_time else None,
        "update_time": item.update_time.isoformat() if item.update_time else None,
    }


def list_payload(db: Session, *, page: int, count: int) -> dict:
    query = db.query(ContentType).order_by(ContentType.id.desc())
    total = query.count()
    items = query.offset(page * count).limit(count).all()
    return {
        "items": [
            {
                "id": item.id,
                "key": item.key,
                "name": item.name,
                "description": item.description,
                "status": item.status,
                "field_count": len(_specs_of(item)),
                "record_count": count_records(db, item.id),
                "update_time": item.update_time.isoformat() if item.update_time else None,
            }
            for item in items
        ],
        "page": page,
        "count": len(items),
        "total": total,
        "total_page": (total + count - 1) // count,
    }


def _user_caps_by_type(db: Session, user_id: int) -> dict[int, set[str]]:
    """用户各内容类型的有效操作并集（其全部分组的授权合并；模型须 active）。"""
    rows = (
        db.query(GroupContentPermission, ContentType.key)
        .join(ContentType, ContentType.id == GroupContentPermission.content_type_id)
        .join(UserGroup, UserGroup.group_id == GroupContentPermission.group_id)
        .filter(UserGroup.user_id == user_id, ContentType.status == ACTIVE)
        .all()
    )
    caps: dict[int, set[str]] = {}
    for grant, _key in rows:
        ops = {
            "read": grant.can_read,
            "create": grant.can_create,
            "update": grant.can_update,
            "delete": grant.can_delete,
        }
        enabled = {op for op, on in ops.items() if on}
        caps.setdefault(grant.content_type_id, set()).update(enabled)
    return caps


def available_payload(db: Session, principal) -> list[dict]:
    """当前主体可见的内容类型与有效操作（无授权类型不出现）。

    Agent 主体额外与 Token 静态 scope 取交集（docs/04 §5.1）。
    """
    from app.services.content_capability_service import _token_caps

    caps = _user_caps_by_type(db, principal.user_id)
    if type(principal).__name__ == "AgentTokenPrincipal":
        caps = {tid: ops & _token_caps(db, principal.token_id, tid) for tid, ops in caps.items()}
    result: list[dict] = []
    for type_id, ops in sorted(caps.items()):
        if not ops:
            continue
        item = db.get(ContentType, type_id)
        if item is None or item.status != ACTIVE:
            continue
        result.append(
            {
                "id": item.id,
                "key": item.key,
                "name": item.name,
                "description": item.description,
                "ops": sorted(ops),
                "field_count": len(_specs_of(item)),
                # 表单/过滤渲染需要的字段定义：能见到该类型即见其 schema（读权限语义）
                "fields": [spec.model_dump(mode="json", exclude_none=True, by_alias=True) for spec in _specs_of(item)],
            }
        )
    return result


def group_exists(db: Session, group_id: int) -> bool:
    return db.query(Group).filter(Group.id == group_id, Group.deleted_token == 0).first() is not None
