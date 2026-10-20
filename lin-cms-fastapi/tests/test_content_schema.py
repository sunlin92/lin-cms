"""内容 schema 校验器测试（docs/05 Task 3，规格 §3.1/§5.2）。"""

from typing import Any

import pytest
from pydantic import ValidationError

from app.core.errors import ContentDataInvalid, ContentSchemaInvalid
from app.schemas.content_type import (
    RESERVED_FIELD_KEYS,
    FieldSpec,
    build_record_model,
    serialize_record,
    validate_type_key,
    validate_type_schema,
)


def _spec(**kwargs: Any) -> dict[str, Any]:
    base = {"key": "title", "label": "标题", "type": "text"}
    base.update(kwargs)
    return base


# --------------------------------- FieldSpec ---------------------------------


@pytest.mark.parametrize(
    ("payload", "reason"),
    [
        (_spec(key="Title"), "大写开头"),  # key 必须小写开头
        (_spec(key="1abc"), "数字开头"),
        (_spec(key="a b"), "含空格"),
        (_spec(key="x" * 60), "超长"),
        (_spec(key="create_time"), "保留字"),
        (_spec(key="record_id"), "保留元字段"),
        (_spec(label=""), "空 label"),
        (_spec(type="richtext"), "非法类型"),
        (_spec(type="select"), "select 缺 options"),
        (_spec(type="select", options=[]), "空选项"),
        (_spec(type="select", options=["a", "a"]), "选项重复"),
        (_spec(type="select", options=["x" * 51]), "选项超长"),
        (_spec(type="text", options=["a"]), "非 select 带 options"),
        (_spec(type="text", max_length=5001), "max_length 超上限"),
        (_spec(type="number", min_=10, max_=1), "min 大于 max"),
        (_spec(type="number", max_length=10), "number 带 max_length"),
        (_spec(type="date", min_=1), "date 带 min"),
    ],
)
def test_field_spec_rejects_invalid(payload: dict[str, Any], reason: str) -> None:
    with pytest.raises(ValidationError, match=r".*"):
        FieldSpec.model_validate(payload)
    # 规则层面统一映射为 ContentSchemaInvalid
    with pytest.raises(ContentSchemaInvalid):
        validate_type_schema([payload], max_fields=100)


def test_field_spec_accepts_valid() -> None:
    specs = validate_type_schema(
        [
            _spec(),
            _spec(key="desc", type="textarea", max_length=2000),
            _spec(key="price", type="number", min_=0, max_=99999),
            _spec(key="done", type="boolean"),
            _spec(key="pub", type="date"),
            _spec(key="cat", type="select", options=["a", "b"], required=True),
        ],
        max_fields=100,
    )
    assert [s.key for s in specs] == ["title", "desc", "price", "done", "pub", "cat"]


def test_validate_type_schema_limits_and_duplicates() -> None:
    with pytest.raises(ContentSchemaInvalid):
        validate_type_schema([_spec(), _spec(type="number")], max_fields=100)  # key 重复
    with pytest.raises(ContentSchemaInvalid):
        validate_type_schema([_spec(key=f"f{i}") for i in range(3)], max_fields=2)  # 字段数超限


@pytest.mark.parametrize(
    ("key", "ok"),
    [("product", True), ("p-2", True), ("Product", False), ("2p", False), ("-p", False), ("p_q", False), ("", False)],
)
def test_validate_type_key(key: str, ok: bool) -> None:
    if ok:
        assert validate_type_key(key) == key
    else:
        with pytest.raises(ContentSchemaInvalid):
            validate_type_key(key)


# ------------------------------ build_record_model ------------------------------


def _fields() -> list[FieldSpec]:
    return validate_type_schema(
        [
            _spec(key="title", required=True),
            _spec(key="count", type="number", min_=0, max_=100),
            _spec(key="done", type="boolean"),
            _spec(key="day", type="date"),
            _spec(key="cat", type="select", options=["a", "b"], required=True),
        ],
        max_fields=100,
    )


def test_record_model_happy_path() -> None:
    model = build_record_model("product", _fields())
    data = model.model_validate({"title": "T", "count": 3, "done": False, "day": "2026-01-02", "cat": "a"})
    assert data.title == "T"
    assert data.count == 3.0
    assert data.day.isoformat() == "2026-01-02"


def test_record_model_required_missing() -> None:
    model = build_record_model("product", _fields())
    with pytest.raises(ValidationError):
        model.model_validate({"count": 1})


def test_record_model_rejects_undeclared_field() -> None:
    model = build_record_model("product", _fields())
    with pytest.raises(ValidationError):
        model.model_validate({"title": "T", "cat": "a", "hacker": 1})


def test_record_model_rejects_bad_values() -> None:
    model = build_record_model("product", _fields())
    bad = [
        {"title": None, "cat": "a"},  # 必填为 null
        {"title": "T", "cat": "c"},  # 枚举外
        {"title": "T", "cat": "a", "count": 101},  # 超 max
        {"title": "T", "cat": "a", "count": "nan"},  # 非数
        {"title": "T", "cat": "a", "done": "yes"},  # 非布尔
        {"title": "T", "cat": "a", "day": "2026-13-01"},  # 非法日期
    ]
    for payload in bad:
        with pytest.raises(ValidationError):
            model.model_validate(payload)


def test_record_model_data_invalid_wrapper() -> None:
    from app.schemas.content_type import validate_record_data

    with pytest.raises(ContentDataInvalid):
        validate_record_data("product", _fields(), {"title": "T"})  # 缺 cat
    clean = validate_record_data("product", _fields(), {"title": "T", "cat": "a"})
    assert clean == {"title": "T", "count": None, "done": None, "day": None, "cat": "a"}


def test_serialize_record_deterministic() -> None:
    a = serialize_record({"b": 1, "a": "x"})
    b = serialize_record({"a": "x", "b": 1})
    assert a == b == '{"a":"x","b":1}'


def test_reserved_keys_complete() -> None:
    for reserved in ("id", "type", "key", "status", "create_time", "update_time", "deleted", "deleted_at"):
        assert reserved in RESERVED_FIELD_KEYS


def test_envelope_conflicting_keys_reserved() -> None:
    """code/message/request 会与前端信封嗅探冲突，必须保留不可用作字段 key（终审 Important 6）。"""
    for reserved in ("code", "message", "request"):
        with pytest.raises(ContentSchemaInvalid):
            validate_type_schema([{"key": reserved, "label": "冲突", "type": "text"}], max_fields=100)
