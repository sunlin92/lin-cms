"""动态内容记录服务：校验、CRUD、软删除与受限过滤/排序（docs/04 §5.2）。

过滤/排序在应用层完成：keyset 分批扫描候选（每批 200 行），单请求扫描上限
LIN_AGENT_CONTENT_FILTER_SCAN_LIMIT；截断时响应 scan_truncated=true。
"""

import json
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ContentPayloadTooLarge, ContentRecordNotFound, ParameterError
from app.models import ContentRecord, ContentType
from app.repositories import content_record_repo
from app.schemas.content_type import (
    FieldSpec,
    parse_schema_json,
    serialize_record,
    validate_record_data,
)
from app.services import agent_audit_service
from app.services.content_capability_service import require_cap
from app.services.content_type_service import get_active_type_by_key

SORTABLE_TYPES = ("text", "number", "date", "boolean")
MAX_FILTER_FIELDS = 5


def _specs(ct: ContentType) -> list[FieldSpec]:
    return parse_schema_json(ct.schema_json)


def _principal_token_id(principal) -> int | None:
    return getattr(principal, "token_id", None)


def _dto(record: ContentRecord, specs: list[FieldSpec]) -> dict:
    data = json.loads(record.data_json)
    payload: dict[str, Any] = {"id": record.id}
    payload.update({spec.key: data.get(spec.key) for spec in specs})
    payload["create_time"] = record.create_time.isoformat() if record.create_time else None
    payload["update_time"] = record.update_time.isoformat() if record.update_time else None
    return payload


def _assert_size(data: dict) -> None:
    if len(serialize_record(data).encode("utf-8")) > get_settings().agent_content_max_record_bytes:
        raise ContentPayloadTooLarge()


def _audit(db: Session, principal, ct: ContentType, action: str, record_id: int | None) -> None:
    agent_audit_service.record(
        db,
        user_id=principal.user_id,
        action=action,
        success=True,
        agent_token_id=_principal_token_id(principal),
        content_type_key=ct.key,
        record_id=record_id,
    )


def create_record(db: Session, principal, type_key: str, data: dict[str, Any]) -> dict:
    ct = get_active_type_by_key(db, type_key)
    require_cap(db, principal, ct.id, "create")
    specs = _specs(ct)
    clean = validate_record_data(ct.key, specs, data)
    _assert_size(clean)
    record = ContentRecord(content_type_id=ct.id, data_json=serialize_record(clean))
    db.add(record)
    db.flush()
    _audit(db, principal, ct, "create_record", record.id)
    return _dto(record, specs)


def _alive_record(db: Session, ct: ContentType, record_id: int) -> ContentRecord:
    record = db.get(ContentRecord, record_id)
    if record is None or record.content_type_id != ct.id or record.deleted_token != 0:
        raise ContentRecordNotFound()
    return record


def get_record(db: Session, principal, type_key: str, record_id: int) -> dict:
    ct = get_active_type_by_key(db, type_key)
    require_cap(db, principal, ct.id, "read")
    record = _alive_record(db, ct, record_id)
    return _dto(record, _specs(ct))


def update_record(db: Session, principal, type_key: str, record_id: int, patch: dict[str, Any]) -> dict:
    ct = get_active_type_by_key(db, type_key)
    require_cap(db, principal, ct.id, "update")
    specs = _specs(ct)
    spec_keys = {spec.key for spec in specs}
    illegal = set(patch) - spec_keys
    if illegal:
        raise ParameterError(f"字段不属于当前模型：{'/'.join(sorted(illegal))}")
    record = _alive_record(db, ct, record_id)
    merged = {**json.loads(record.data_json), **patch}
    clean = validate_record_data(ct.key, specs, merged)
    _assert_size(clean)
    record.data_json = serialize_record(clean)
    db.flush()
    _audit(db, principal, ct, "update_record", record.id)
    return _dto(record, specs)


def delete_record(db: Session, principal, type_key: str, record_id: int) -> None:
    ct = get_active_type_by_key(db, type_key)
    require_cap(db, principal, ct.id, "delete")
    record = _alive_record(db, ct, record_id)
    record.soft_delete()
    db.flush()
    _audit(db, principal, ct, "delete_record", record.id)


# --------------------------------- 过滤与排序 ---------------------------------


def _coerce_filter_value(spec: FieldSpec, raw: str) -> Any:
    try:
        if spec.type == "number":
            return float(raw)
        if spec.type == "boolean":
            if raw.lower() not in ("true", "false"):
                raise ValueError
            return raw.lower() == "true"
        if spec.type == "date":
            return date.fromisoformat(raw).isoformat()
        if spec.type == "select":
            if raw not in (spec.options or []):
                raise ParameterError(f"过滤值不在选项内：{spec.key}")
            return raw
        return raw
    except ValueError as exc:
        raise ParameterError(f"过滤值类型不合法：{spec.key}") from exc


def parse_filters(specs: list[FieldSpec], raw_filters: dict[str, str]) -> dict[str, Any]:
    if len(raw_filters) > MAX_FILTER_FIELDS:
        raise ParameterError(f"过滤字段最多 {MAX_FILTER_FIELDS} 个")
    by_key = {spec.key: spec for spec in specs}
    unknown = set(raw_filters) - set(by_key)
    if unknown:
        raise ParameterError(f"过滤字段不属于模型：{'/'.join(sorted(unknown))}")
    return {key: _coerce_filter_value(by_key[key], raw) for key, raw in raw_filters.items()}


def _sort_key_fn(spec: FieldSpec):
    def key(item: tuple[ContentRecord, dict]):
        value = item[1].get(spec.key)
        return (value is None, value)  # None 排最后，其余按值自然序

    return key


def list_records(
    db: Session,
    principal,
    type_key: str,
    *,
    page: int,
    count: int,
    filters: dict[str, str],
    sort_key: str | None,
    order: str,
) -> dict:
    ct = get_active_type_by_key(db, type_key)
    require_cap(db, principal, ct.id, "read")
    specs = _specs(ct)
    parsed = parse_filters(specs, filters)
    by_key = {spec.key: spec for spec in specs}
    if sort_key is not None and sort_key not in by_key:
        raise ParameterError(f"排序字段不属于模型：{sort_key}")
    if sort_key is not None and by_key[sort_key].type not in SORTABLE_TYPES:
        raise ParameterError(f"该字段类型不支持排序：{sort_key}")
    if order not in ("asc", "desc"):
        raise ParameterError("order 只能是 asc 或 desc")

    if not parsed and sort_key is None:
        rows, total = content_record_repo.page_alive_records(db, ct.id, offset=page * count, limit=count)
        return {
            "items": [_dto(row, specs) for row in rows],
            "page": page,
            "count": len(rows),
            "total": total,
            "total_page": (total + count - 1) // count,
            "scan_truncated": False,
        }

    settings = get_settings()
    candidates, truncated = content_record_repo.scan_alive_records(
        db, ct.id, max_rows=settings.agent_content_filter_scan_limit
    )
    matched: list[tuple[ContentRecord, dict]] = []
    for row in candidates:
        data = json.loads(row.data_json)
        if all(data.get(key) == value for key, value in parsed.items()):
            matched.append((row, data))
    if sort_key is not None:
        matched.sort(key=_sort_key_fn(by_key[sort_key]), reverse=(order == "desc"))
    total = len(matched)
    window = matched[page * count : (page + 1) * count]
    return {
        "items": [_dto(row, specs) for row, _ in window],
        "page": page,
        "count": len(window),
        "total": total,
        "total_page": (total + count - 1) // count,
        "scan_truncated": truncated,
    }
