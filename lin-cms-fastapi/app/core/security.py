"""安全工具：JWT 签发/校验（策略化的 TokenService）与密码哈希（Argon2id + 旧 scrypt 兼容）。"""

import base64
import hashlib
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

import jwt

from app.core.config import Settings
from app.core.errors import TokenExpired, TokenInvalid

SCOPE = "lin"
ACCESS = "access"
REFRESH = "refresh"


def _now() -> datetime:
    return datetime.now(tz=UTC)


class PasswordVerifier(Protocol):
    def __call__(self, raw: str, stored: str) -> bool: ...


def _verify_werkzeug_scrypt(raw: str, stored: str) -> bool:
    """兼容旧 Flask/Werkzeug 的 ``scrypt:N:r:P$salt$hash`` 格式。"""
    try:
        method, salt_b64, expected_hex = stored.split("$")
        _, n, r, p = method.split(":")
        digest = hashlib.scrypt(
            raw.encode("utf-8"),
            salt=base64.b64decode(salt_b64),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=64,
        )
        return digest.hex() == expected_hex
    except (ValueError, TypeError):
        return False


class PasswordHasher:
    """策略模式：新密码 Argon2id；旧 scrypt 哈希登录成功后由 service 层升级。"""

    def __init__(self) -> None:
        from argon2 import PasswordHasher as ArgonHasher

        self._argon = ArgonHasher()

    def hash(self, raw: str) -> str:
        return self._argon.hash(raw)

    def verify(self, raw: str, stored: str) -> bool:
        if stored.startswith("scrypt:"):
            return _verify_werkzeug_scrypt(raw, stored)
        if stored.startswith("$argon2"):
            from argon2.exceptions import VerifyMismatchError

            try:
                return self._argon.verify(stored, raw)
            except VerifyMismatchError:
                return False
        return False

    def needs_upgrade(self, stored: str) -> bool:
        return not stored.startswith("$argon2")


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str


class TokenService:
    def __init__(self, settings: Settings) -> None:
        self._secret = settings.secret_key
        self._access_ttl = settings.access_token_ttl
        self._refresh_ttl = settings.refresh_token_ttl

    def _encode(self, *, uid: int, ver: int, token_type: str, ttl: int) -> str:
        now = _now()
        claims: dict[str, Any] = {
            "sub": str(uid),
            "type": token_type,
            "scope": SCOPE,
            "ver": ver,
            "jti": uuid.uuid4().hex,
            "iat": now,
            "exp": now + timedelta(seconds=ttl),
        }
        return jwt.encode(claims, self._secret, algorithm="HS256")

    def create_pair(self, *, uid: int, ver: int) -> TokenPair:
        return TokenPair(
            access_token=self._encode(uid=uid, ver=ver, token_type=ACCESS, ttl=self._access_ttl),
            refresh_token=self._encode(uid=uid, ver=ver, token_type=REFRESH, ttl=self._refresh_ttl),
        )

    def decode(self, token: str, *, expected_type: str = ACCESS) -> dict[str, Any]:
        """解码并校验签名/过期/类型；失败抛契约化异常（RefreshFailed 由调用方转换）。"""
        try:
            claims = jwt.decode(token, self._secret, algorithms=["HS256"])
        except jwt.ExpiredSignatureError as exc:
            raise TokenExpired() from exc
        except jwt.PyJWTError as exc:
            raise TokenInvalid() from exc
        if claims.get("scope") != SCOPE or claims.get("type") != expected_type:
            raise TokenInvalid()
        return claims

    def decode_unverified(self, token: str) -> dict[str, Any] | None:
        try:
            return jwt.decode(token, self._secret, algorithms=["HS256"])
        except jwt.PyJWTError:
            return None


password_hasher = PasswordHasher()
