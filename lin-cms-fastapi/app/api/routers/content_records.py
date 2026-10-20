"""内容记录路由：Session 或 Agent Token 双通道（docs/04 §5.2）。

动态过滤参数形如 f_<field_key>=<标量>（≤5 个、等值）；DTO 成功、错误走统一信封。
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import get_content_principal
from app.core.errors import success_envelope
from app.core.rate_limit import scope_limiter
from app.db.session import get_db
from app.services import dynamic_content_service

router = APIRouter(prefix="/api/v1/content", tags=["内容记录"], dependencies=[Depends(scope_limiter("agent_content"))])


def _extract_filters(request: Request) -> dict[str, str]:
    raw: dict[str, str] = {}
    for key, value in request.query_params.items():
        if key.startswith("f_"):
            raw[key[2:]] = value
    return raw


@router.get("/{type_key}")
def list_records(
    type_key: str,
    request: Request,
    page: Annotated[int, Query(ge=0)] = 0,
    count: Annotated[int, Query(ge=1, le=15)] = 5,
    sort: str | None = None,
    order: str = "desc",
    principal=Depends(get_content_principal),
    db: Session = Depends(get_db),
) -> dict:
    return dynamic_content_service.list_records(
        db,
        principal,
        type_key,
        page=page,
        count=count,
        filters=_extract_filters(request),
        sort_key=sort,
        order=order,
    )


@router.post("/{type_key}")
def create_record(
    type_key: str,
    request: Request,
    payload: dict[str, Any],
    principal=Depends(get_content_principal),
    db: Session = Depends(get_db),
) -> dict:
    dto = dynamic_content_service.create_record(db, principal, type_key, payload)
    db.commit()
    return dto


@router.get("/{type_key}/{record_id}")
def get_record(
    type_key: str,
    record_id: int,
    principal=Depends(get_content_principal),
    db: Session = Depends(get_db),
) -> dict:
    return dynamic_content_service.get_record(db, principal, type_key, record_id)


@router.patch("/{type_key}/{record_id}")
def update_record(
    type_key: str,
    record_id: int,
    request: Request,
    payload: dict[str, Any],
    principal=Depends(get_content_principal),
    db: Session = Depends(get_db),
) -> dict:
    dto = dynamic_content_service.update_record(db, principal, type_key, record_id, payload)
    db.commit()
    return dto


@router.delete("/{type_key}/{record_id}")
def delete_record(
    type_key: str,
    record_id: int,
    request: Request,
    principal=Depends(get_content_principal),
    db: Session = Depends(get_db),
) -> dict:
    dynamic_content_service.delete_record(db, principal, type_key, record_id)
    db.commit()
    return success_envelope(request, message="记录已删除")
