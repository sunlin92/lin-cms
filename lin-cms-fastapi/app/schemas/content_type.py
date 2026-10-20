"""内容类型声明式 schema：字段规格校验与动态记录模型（docs/04 §3.1/§5.2）。

只接受受限声明式字段定义；禁止表达式、代码、SQL、外部引用。
记录校验通过 pydantic.create_model 动态组装，extra=forbid 拒绝未声明字段。
"""

import json
import re
from datetime import date
from typing import Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictStr,
    ValidationError,
    create_model,
    field_validator,
    model_validator,
)

from app.core.errors import ContentDataInvalid, ContentSchemaInvalid

FIELD_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,49}$")
TYPE_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9-]{1,79}$")

FIELD_TYPES = ("text", "textarea", "number", "boolean", "date", "select")

MAX_LABEL_LENGTH = 50
MAX_OPTION_LENGTH = 50
MAX_OPTIONS_COUNT = 50
MAX_TEXT_LENGTH = 5000

# 保留元字段：不允许作为内容字段 key（与记录 DTO/内部字段冲突）
RESERVED_FIELD_KEYS = frozenset(
    {
        "id",
        "type",
        "key",
        "status",
        # 信封字段：前端 client 以 code/message/request 嗅探响应形态，内容字段与其冲突会误判
        "code",
        "message",
        "request",
        "create_time",
        "update_time",
        "deleted",
        "deleted_at",
        "deleted_token",
        "record_id",
    }
)


class FieldSpec(BaseModel):
    """单个内容字段的声明式定义。"""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    key: str
    label: str = Field(min_length=1, max_length=MAX_LABEL_LENGTH)
    type: Literal["text", "textarea", "number", "boolean", "date", "select"]
    required: bool = False
    options: list[str] | None = None
    max_length: int | None = Field(default=None, gt=0, le=MAX_TEXT_LENGTH)
    min_: float | None = Field(default=None, alias="min")
    max_: float | None = Field(default=None, alias="max")

    @field_validator("key")
    @classmethod
    def _check_key(cls, value: str) -> str:
        if not FIELD_KEY_PATTERN.match(value):
            raise ValueError(f"字段 key 只能是小写字母开头的字母/数字/下划线，且不超过 50 字符：{value!r}")
        if value in RESERVED_FIELD_KEYS:
            raise ValueError(f"字段 key 与保留元字段冲突：{value!r}")
        return value

    @model_validator(mode="after")
    def _check_combinations(self) -> "FieldSpec":
        """跨字段约束集中在 after 校验器：默认值（未传 options 等）也必须经过检查。"""
        if self.type != "select":
            if self.options is not None:
                raise ValueError("只有 select 字段允许 options")
        else:
            if not self.options:
                raise ValueError("select 字段必须提供非空 options")
            if len(self.options) > MAX_OPTIONS_COUNT:
                raise ValueError(f"options 数量不得超过 {MAX_OPTIONS_COUNT}")
            if len(set(self.options)) != len(self.options):
                raise ValueError("options 不得重复")
            for option in self.options:
                if not option or len(option) > MAX_OPTION_LENGTH:
                    raise ValueError(f"option 必须为 1..{MAX_OPTION_LENGTH} 字符：{option!r}")
        if self.max_length is not None and self.type not in ("text", "textarea"):
            raise ValueError("max_length 仅适用于 text/textarea 字段")
        if self.type != "number" and (self.min_ is not None or self.max_ is not None):
            raise ValueError("min/max 仅适用于 number 字段")
        if self.type == "number" and self.min_ is not None and self.max_ is not None and self.min_ > self.max_:
            raise ValueError("number 字段的 min 不得大于 max")
        return self


def validate_type_schema(fields: list[dict[str, Any]], *, max_fields: int) -> list[FieldSpec]:
    """校验整份字段定义：逐条 FieldSpec + 数量与 key 去重；失败统一抛 ContentSchemaInvalid。"""
    if not fields:
        raise ContentSchemaInvalid("至少需要一个字段定义")
    if len(fields) > max_fields:
        raise ContentSchemaInvalid(f"字段数量不得超过 {max_fields}")
    specs: list[FieldSpec] = []
    seen: set[str] = set()
    for raw in fields:
        try:
            spec = FieldSpec.model_validate(raw)
        except ValidationError as exc:
            raise ContentSchemaInvalid(f"字段定义不合法：{exc.errors()[0]['msg']}") from exc
        if spec.key in seen:
            raise ContentSchemaInvalid(f"字段 key 重复：{spec.key}")
        seen.add(spec.key)
        specs.append(spec)
    return specs


def validate_type_key(key: str) -> str:
    if not TYPE_KEY_PATTERN.match(key):
        raise ContentSchemaInvalid("类型 key 必须为小写字母开头、仅含小写字母/数字/连字符（2..80 字符）")
    return key


def build_record_model(type_key: str, fields: list[FieldSpec]) -> type[BaseModel]:
    """按字段规格动态组装记录校验模型；未声明字段一律拒绝。

    str/number/boolean 走 strict 模式（JSON 原生类型之外的字符串转换一律拒绝，
    规格要求"不允许类型均拒绝"）；date 接受 ISO 日期字符串；number 仍接受 int。
    """
    defs: dict[str, Any] = {}
    for spec in fields:
        if spec.type in ("text", "textarea"):
            annotation: Any = StrictStr
            constraints: dict[str, Any] = {"max_length": spec.max_length} if spec.max_length else {}
        elif spec.type == "number":
            annotation = float
            constraints: dict[str, Any] = {"strict": True, "allow_inf_nan": False}
            if spec.min_ is not None:
                constraints["ge"] = spec.min_
            if spec.max_ is not None:
                constraints["le"] = spec.max_
        elif spec.type == "boolean":
            annotation = bool
            constraints = {"strict": True}
        elif spec.type == "date":
            annotation = date
            constraints = {}
        else:  # select
            annotation = Literal[tuple(spec.options or [])]  # type: ignore[valid-type]
            constraints = {}
        if spec.required:
            defs[spec.key] = (annotation, Field(..., **constraints))
        else:
            defs[spec.key] = (annotation | None, Field(default=None, **constraints))
    return create_model(f"ContentRecord_{type_key}", __config__=ConfigDict(extra="forbid"), **defs)


def validate_record_data(type_key: str, fields: list[FieldSpec], data: dict[str, Any]) -> dict[str, Any]:
    """校验并规范化一条记录数据；失败抛 ContentDataInvalid。"""
    model = build_record_model(type_key, fields)
    try:
        instance = model.model_validate(data)
    except ValidationError as exc:
        first = exc.errors()[0]
        raise ContentDataInvalid(f"字段 {first.get('loc', ('?',))[0]}：{first['msg']}") from exc
    dumped: dict[str, Any] = instance.model_dump(mode="json")
    return {key: dumped[key] for key in (spec.key for spec in fields)}


def serialize_record(data: dict[str, Any]) -> str:
    """确定性 JSON 序列化（排序键、紧凑分隔符），供存储与应用层过滤共用。"""
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


# ---------------------------- 请求/响应 DTO（路由用） ----------------------------


class ContentTypeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    key: str
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    fields: list[dict[str, Any]]


class ContentTypeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    fields: list[dict[str, Any]]


def field_specs_to_json(specs: list[FieldSpec]) -> str:
    """schema 以有序数组存储（字段顺序是 schema 的一部分），确定性紧凑序列化。"""
    return json.dumps(
        [spec.model_dump(mode="json", exclude_none=True, by_alias=True) for spec in specs],
        ensure_ascii=False,
        separators=(",", ":"),
    )


def parse_schema_json(schema_json: str) -> list[FieldSpec]:
    """从库存 schema_json 还原字段规格（内部数据，异常按非法处理）。"""
    try:
        raw = json.loads(schema_json)
        if isinstance(raw, list):
            return [FieldSpec.model_validate(item) for item in raw]
        raise ContentSchemaInvalid("库存 schema 数据损坏")
    except (json.JSONDecodeError, ValidationError, AttributeError) as exc:
        raise ContentSchemaInvalid("库存 schema 数据损坏") from exc
