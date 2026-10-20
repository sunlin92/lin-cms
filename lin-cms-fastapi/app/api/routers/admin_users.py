"""管理员路由：用户分页/更新/重置密码/删除。"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import require_root
from app.core.errors import success_envelope
from app.db.session import get_db
from app.models import User
from app.schemas.admin import AdminUserPageOut, AdminUserPageQuery, AdminUserUpdateIn
from app.schemas.user import ResetPasswordIn
from app.services import user_service

router = APIRouter(prefix="/cms/admin", tags=["管理员"])


@router.get("/users", response_model=AdminUserPageOut)
def list_users(
    query: Annotated[AdminUserPageQuery, Query()],
    db: Session = Depends(get_db),
    _operator: User = Depends(require_root),
) -> AdminUserPageOut:
    return AdminUserPageOut(**user_service.page_users(db, query))


@router.put("/user/{uid}")
def update_user(
    uid: int,
    payload: AdminUserUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    _operator: User = Depends(require_root),
) -> dict:
    user_service.admin_update_user(db, uid, payload)
    return success_envelope(request, message="操作成功")


@router.put("/user/{uid}/password")
def reset_password(
    uid: int,
    payload: ResetPasswordIn,
    request: Request,
    db: Session = Depends(get_db),
    _operator: User = Depends(require_root),
) -> dict:
    user_service.admin_reset_password(db, uid, payload.new_password)
    return success_envelope(request, message="密码修改成功")


@router.delete("/user/{uid}")
def delete_user(
    uid: int,
    request: Request,
    db: Session = Depends(get_db),
    _operator: User = Depends(require_root),
) -> dict:
    user_service.admin_delete_user(db, uid, request)
    return success_envelope(request, message="操作成功")
