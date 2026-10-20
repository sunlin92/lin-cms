"""认证路由：登录、刷新、登出、验证码。"""

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from app.api.deps import CurrentAuth, get_current_auth, get_token_service
from app.core.config import Settings
from app.core.errors import success_envelope
from app.core.rate_limit import scope_limiter
from app.db.session import get_db
from app.schemas.user import CaptchaOut, LoginIn, LogoutIn, TokenPairOut
from app.services import auth_service

router = APIRouter(prefix="/cms/user", tags=["用户"])

login_limit = scope_limiter("login")
refresh_limit = scope_limiter("refresh")
logout_limit = scope_limiter("logout")
captcha_limit = scope_limiter("captcha")


@router.post("/login", response_model=TokenPairOut)
def login(
    payload: LoginIn,
    request: Request,
    db: Session = Depends(get_db),
    tokens=Depends(get_token_service),
    tag: str | None = Header(default=None),
    _limit=Depends(login_limit),
) -> TokenPairOut:
    settings: Settings = request.app.state.settings
    _, pair = auth_service.login(db, settings, tokens, payload, tag)
    return TokenPairOut(access_token=pair.access_token, refresh_token=pair.refresh_token)


@router.get("/refresh", response_model=TokenPairOut)
def refresh(
    request: Request,
    db: Session = Depends(get_db),
    tokens=Depends(get_token_service),
    authorization: str = Header(default=""),
    _limit=Depends(refresh_limit),
) -> TokenPairOut:
    token = authorization.removeprefix("Bearer ").strip()
    pair = auth_service.refresh(db, tokens, token)
    return TokenPairOut(access_token=pair.access_token, refresh_token=pair.refresh_token)


@router.post("/logout")
def logout(
    request: Request,
    body: LogoutIn | None = None,
    auth: CurrentAuth = Depends(get_current_auth),
    db: Session = Depends(get_db),
    tokens=Depends(get_token_service),
    _limit=Depends(logout_limit),
) -> dict:
    auth_service.logout(db, tokens, auth.user, auth.claims, body or LogoutIn())
    return success_envelope(request, message="退出成功")


@router.get("/captcha", response_model=CaptchaOut)
def captcha_get(request: Request, _limit=Depends(captcha_limit)) -> CaptchaOut:
    return _captcha(request)


@router.post("/captcha", response_model=CaptchaOut)
def captcha_post(request: Request, _limit=Depends(captcha_limit)) -> CaptchaOut:
    return _captcha(request)


def _captcha(request: Request) -> CaptchaOut:
    settings: Settings = request.app.state.settings
    if not settings.login_captcha:
        return CaptchaOut()
    return CaptchaOut(tag=_issue_captcha_tag(settings), image=_captcha_image())


def _issue_captcha_tag(settings: Settings) -> str:
    import jwt as pyjwt

    from app.util.captcha import generate_code

    code = generate_code()
    return pyjwt.encode({"code": code}, settings.secret_key, algorithm="HS256")


def _captcha_image() -> str:
    from app.util.captcha import render_png

    return render_png()
