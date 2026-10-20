"""认证服务：登录（含验证码）、令牌刷新、登出吊销。"""

from datetime import UTC

import jwt as pyjwt
from fastapi import Request
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import Failed, RefreshFailed
from app.core.security import TokenService
from app.models import Log, TokenBlocklist, User
from app.repositories import user_repo
from app.schemas.user import LoginIn, LogoutIn


def _verify_captcha(settings: Settings, tag_header: str | None, captcha: str | None) -> None:
    if not settings.login_captcha:
        return
    try:
        code = pyjwt.decode(tag_header or "", settings.secret_key, algorithms=["HS256"]).get("code")
    except pyjwt.PyJWTError as exc:
        raise Failed("验证码校验失败") from exc
    if not code or captcha != code:
        raise Failed("验证码校验失败")


def login(
    db: Session, settings: Settings, tokens: TokenService, payload: LoginIn, tag_header: str | None
) -> tuple[User, object]:
    _verify_captcha(settings, tag_header, payload.captcha)
    user = user_repo.verify_login(db, payload.username, payload.password)
    pair = tokens.create_pair(uid=user.id, ver=user.token_version)
    db.add(
        Log(
            message=f"{user.username}登录成功获取了令牌",
            user_id=user.id,
            username=user.username,
            status_code=200,
            method="POST",
            path="/cms/user/login",
            permission="",
        )
    )
    return user, pair


def _is_revoked(db: Session, jti: str) -> bool:
    return db.query(TokenBlocklist).filter(TokenBlocklist.jti == jti).first() is not None


def _revoke(db: Session, *, jti: str, user_id: int, expires_at) -> None:
    if not _is_revoked(db, jti):
        db.add(TokenBlocklist(jti=jti, user_id=user_id, expires_at=expires_at))
    # 顺带清理已过期条目
    from datetime import datetime

    db.query(TokenBlocklist).filter(TokenBlocklist.expires_at < datetime.utcnow()).delete()


def refresh(db: Session, tokens: TokenService, refresh_token: str):
    from app.core.errors import APIException

    try:
        claims = tokens.decode(refresh_token, expected_type="refresh")
    except APIException as exc:
        raise RefreshFailed() from exc
    if _is_revoked(db, claims["jti"]):
        raise RefreshFailed()
    user = user_repo.get_by_id(db, int(claims["sub"]))
    if user is None or claims.get("ver", 0) != user.token_version:
        raise RefreshFailed()
    return tokens.create_pair(uid=user.id, ver=user.token_version)


def logout(db: Session, tokens: TokenService, user: User, access_claims: dict, body: LogoutIn) -> None:
    _revoke(
        db,
        jti=access_claims["jti"],
        user_id=user.id,
        expires_at=_expiry_of(access_claims),
    )
    if body.refresh_token:
        rclaims = tokens.decode_unverified(body.refresh_token)
        if rclaims and rclaims.get("type") == "refresh":
            _revoke(
                db,
                jti=rclaims["jti"],
                user_id=user.id,
                expires_at=_expiry_of(rclaims),
            )


def _expiry_of(claims: dict):
    from datetime import datetime

    return datetime.fromtimestamp(claims["exp"], tz=UTC).replace(tzinfo=None)


def revoked_jti(db: Session, jti: str) -> bool:
    return _is_revoked(db, jti)


def avatar_url(settings: Settings, request: Request, value: str | None) -> str | None:
    """头像/文件绝对 URL：已有协议头直接返回；相对路径拼接站点域名（或请求 Host）。"""
    if not value:
        return None
    if value.startswith(("http://", "https://", "data:")):
        return value
    base = settings.site_domain or str(request.base_url).rstrip("/")
    return f"{base}/assets/{value.lstrip('/')}"
