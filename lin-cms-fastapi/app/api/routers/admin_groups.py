"""管理员路由：分组 CRUD 与权限分发/回收。"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import require_root
from app.core.errors import success_envelope
from app.db.session import get_db
from app.models import User
from app.schemas.admin import (
    AdminGroupOut,
    GroupBaseIn,
    GroupCreateIn,
    GroupDetailOut,
    GroupPermissionDispatchIn,
)
from app.services import group_service

router = APIRouter(prefix="/cms/admin", tags=["管理员"])


@router.get("/permission")
def list_permissions(db: Session = Depends(get_db), _operator: User = Depends(require_root)) -> dict:
    return group_service.permissions_grouped_payload(db)


@router.get("/group/all", response_model=list[AdminGroupOut])
def all_groups(db: Session = Depends(get_db), _operator: User = Depends(require_root)) -> list[AdminGroupOut]:
    return [AdminGroupOut(**item) for item in group_service.all_groups_payload(db)]


@router.get("/group/{gid}", response_model=GroupDetailOut)
def group_detail(gid: int, db: Session = Depends(get_db), _operator: User = Depends(require_root)) -> GroupDetailOut:
    return GroupDetailOut(**group_service.group_detail_payload(db, gid))


@router.post("/group")
def create_group(
    payload: GroupCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    operator: User = Depends(require_root),
) -> dict:
    group_service.create_group(db, payload, request, operator)
    return success_envelope(request, message="新建用户组成功")


@router.put("/group/{gid}")
def update_group(
    gid: int,
    payload: GroupBaseIn,
    request: Request,
    db: Session = Depends(get_db),
    _operator: User = Depends(require_root),
) -> dict:
    group_service.update_group(db, gid, payload)
    return success_envelope(request, message="更新成功")


@router.delete("/group/{gid}")
def delete_group(
    gid: int,
    request: Request,
    db: Session = Depends(get_db),
    operator: User = Depends(require_root),
) -> dict:
    group_service.delete_group(db, gid, request, operator)
    return success_envelope(request, message="删除分组成功")


@router.post("/permission/dispatch/batch")
def dispatch_permissions(
    payload: GroupPermissionDispatchIn,
    request: Request,
    db: Session = Depends(get_db),
    _operator: User = Depends(require_root),
) -> dict:
    group_service.dispatch_permissions(db, payload.group_id, payload.permission_ids)
    return success_envelope(request, message="添加权限成功")


@router.post("/permission/remove")
def remove_permissions(
    payload: GroupPermissionDispatchIn,
    request: Request,
    db: Session = Depends(get_db),
    _operator: User = Depends(require_root),
) -> dict:
    group_service.remove_permissions(db, payload.group_id, payload.permission_ids)
    return success_envelope(request, message="删除权限成功")
