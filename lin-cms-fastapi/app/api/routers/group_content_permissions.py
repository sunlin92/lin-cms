"""分组内容权限路由（Root）：读取与全量替换（docs/04 §5.1.1）。

对隐藏的 ROOT 组同样可配置内容 ACL；旧 /cms/admin/group/all 响应不受影响。
"""

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.deps import require_root
from app.core.errors import success_envelope
from app.db.session import get_db
from app.models import User
from app.services import group_content_permission_service

router = APIRouter(prefix="/api/v1/admin", tags=["分组内容权限"])


class ContentGrantIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content_type_id: int
    can_read: bool = False
    can_create: bool = False
    can_update: bool = False
    can_delete: bool = False


class ContentGrantsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entries: list[ContentGrantIn] = Field(max_length=100)


@router.get("/groups/{group_id}/content-permissions")
def get_grants(group_id: int, db: Session = Depends(get_db), _operator: User = Depends(require_root)) -> dict:
    return group_content_permission_service.grants_payload(db, group_id)


@router.put("/groups/{group_id}/content-permissions")
def put_grants(
    group_id: int,
    payload: ContentGrantsIn,
    request: Request,
    db: Session = Depends(get_db),
    _operator: User = Depends(require_root),
) -> dict:
    group_content_permission_service.replace_group_grants(
        db, group_id, [entry.model_dump() for entry in payload.entries]
    )
    db.commit()
    return success_envelope(request, message="内容权限已保存，立即生效")
