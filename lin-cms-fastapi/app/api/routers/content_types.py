"""内容类型路由：发现（available）与 Root 管理 CRUD（docs/04 §5.1）。

查询返回纯 DTO、写操作返回信封（沿用既有路由风格）。
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import get_content_principal, require_root
from app.core.config import get_settings
from app.core.errors import success_envelope
from app.core.rate_limit import scope_limiter
from app.db.session import get_db
from app.models import User
from app.schemas.content_type import ContentTypeCreate, ContentTypeUpdate
from app.services import content_type_service
from app.services.content_type_service import ACTIVE, ARCHIVED

router = APIRouter(
    prefix="/api/v1",
    tags=["内容类型"],
    dependencies=[Depends(scope_limiter("agent_content"))],
)


@router.get("/content-types/available")
def list_available(principal=Depends(get_content_principal), db: Session = Depends(get_db)) -> list[dict]:
    """浏览器会话或 Agent Token 均可发现可用内容类型（Agent 只见 scope 交集内模型）。"""
    return content_type_service.available_payload(db, principal)


@router.get("/admin/content-types")
def admin_list_types(
    page: Annotated[int, Query(ge=0)] = 0,
    count: Annotated[int, Query(ge=1, le=15)] = 5,
    db: Session = Depends(get_db),
    _operator: User = Depends(require_root),
) -> dict:
    return content_type_service.list_payload(db, page=page, count=count)


@router.post("/admin/content-types")
def admin_create_type(
    payload: ContentTypeCreate,
    request: Request,
    db: Session = Depends(get_db),
    _operator: User = Depends(require_root),
) -> dict:
    content_type_service.create_type(db, payload, max_fields=get_settings().agent_content_max_fields)
    db.commit()
    return success_envelope(request, message="内容类型创建成功")


@router.get("/admin/content-types/{type_id}")
def admin_get_type(type_id: int, db: Session = Depends(get_db), _operator: User = Depends(require_root)) -> dict:
    return content_type_service.detail_payload(db, type_id)


@router.put("/admin/content-types/{type_id}")
def admin_update_type(
    type_id: int,
    payload: ContentTypeUpdate,
    request: Request,
    db: Session = Depends(get_db),
    _operator: User = Depends(require_root),
) -> dict:
    content_type_service.update_type(db, type_id, payload, max_fields=get_settings().agent_content_max_fields)
    db.commit()
    return success_envelope(request, message="内容类型更新成功")


@router.post("/admin/content-types/{type_id}/archive")
def admin_archive_type(
    type_id: int, request: Request, db: Session = Depends(get_db), _operator: User = Depends(require_root)
) -> dict:
    content_type_service.set_status(db, type_id, ARCHIVED)
    db.commit()
    return success_envelope(request, message="内容类型已归档")


@router.post("/admin/content-types/{type_id}/restore")
def admin_restore_type(
    type_id: int, request: Request, db: Session = Depends(get_db), _operator: User = Depends(require_root)
) -> dict:
    content_type_service.set_status(db, type_id, ACTIVE)
    db.commit()
    return success_envelope(request, message="内容类型已恢复")
