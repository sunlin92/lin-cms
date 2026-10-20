"""用户路由：注册（管理员建用户）、资料、改密、信息、权限清单。"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_root
from app.core.config import Settings
from app.core.errors import success_envelope
from app.core.rate_limit import scope_limiter
from app.db.session import get_db
from app.models import User
from app.schemas.user import ChangePasswordIn, ProfileUpdateIn, RegisterIn, UserOut
from app.services import user_service

router = APIRouter(prefix="/cms/user", tags=["用户"])

register_limit = scope_limiter("register")


@router.post("/register")
def register(
    payload: RegisterIn,
    request: Request,
    db: Session = Depends(get_db),
    _operator: User = Depends(require_root),
    _limit=Depends(register_limit),
) -> dict:
    user_service.register_user(db, payload, request)
    return success_envelope(request, message="用户创建成功")


@router.put("")
def update_profile(
    payload: ProfileUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    user_service.update_profile(db, user, payload)
    return success_envelope(request, message="用户信息更新成功")


@router.put("/change_password")
def change_password(
    payload: ChangePasswordIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    user_service.change_password(
        db,
        user,
        old_password=payload.old_password,
        new_password=payload.new_password,
        request=request,
    )
    return success_envelope(request, message="密码修改成功")


@router.get("/information", response_model=UserOut)
def information(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserOut:
    settings: Settings = request.app.state.settings
    return UserOut(**user_service.user_payload(db, settings, request, user))


@router.get("/permissions")
def permissions(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    settings: Settings = request.app.state.settings
    return user_service.permissions_payload(db, settings, request, user)
