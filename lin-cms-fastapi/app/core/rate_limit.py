"""进程内滑动窗口限流（零外部中间件）。

每个作用域（login/refresh/...）独立计数；键为 作用域:客户端IP。
多 worker 部署时各进程独立计数，属已知限制（见规划书 ADR-9）。
"""

import threading
import time
from collections import deque
from collections.abc import Callable

from fastapi import Request

from app.core.config import Settings
from app.core.errors import RequestLimit


class SlidingWindowCounter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._hits: dict[str, deque[float]] = {}

    def hit(self, key: str, *, limit: int, window: float) -> bool:
        """记录一次命中；返回是否仍在限额内。"""
        now = time.monotonic()
        with self._lock:
            bucket = self._hits.setdefault(key, deque())
            while bucket and bucket[0] <= now - window:
                bucket.popleft()
            if len(bucket) >= limit:
                return False
            bucket.append(now)
            return True


counter = SlidingWindowCounter()


def client_ip(request: Request, *, trust_proxy: bool) -> str:
    if trust_proxy:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def make_rate_limiter(settings: Settings, scope: str, *, limit: int, window: float) -> Callable[[Request], None]:
    """依赖工厂：生成指定限额的 FastAPI 依赖。"""

    def _check(request: Request) -> None:
        if not settings.rate_limit_enabled:
            return
        key = f"{scope}:{client_ip(request, trust_proxy=settings.trust_proxy)}"
        if not counter.hit(key, limit=limit, window=window):
            raise RequestLimit()

    return _check


MINUTE = 60.0
HOUR = 3600.0


def default_limiters(settings: Settings) -> dict[str, Callable[[Request], None]]:
    limiters = {
        "login": make_rate_limiter(settings, "login", limit=settings.rate_login, window=MINUTE),
        "refresh": make_rate_limiter(settings, "refresh", limit=settings.rate_refresh, window=MINUTE),
        "logout": make_rate_limiter(settings, "logout", limit=settings.rate_logout, window=MINUTE),
        "captcha": make_rate_limiter(settings, "captcha", limit=settings.rate_captcha, window=MINUTE),
        "register": make_rate_limiter(settings, "register", limit=settings.rate_register, window=HOUR),
    }
    if settings.agent_rate_limit_enabled:
        # Agent 内容面：默认 120 次/分钟/IP（进程内，无外部中间件）
        limiters["agent_content"] = make_rate_limiter(
            settings, "agent_content", limit=settings.agent_rate_limit_per_minute, window=MINUTE
        )
    return limiters


def scope_limiter(scope: str) -> Callable[[Request], None]:
    """按作用域生成 FastAPI 依赖：从 app.state.limiters 取对应限流器执行。

    参数必须带 Request 注解，否则会被解析成查询参数。
    """

    def _dep(request: Request) -> None:
        limiter = request.app.state.limiters.get(scope)
        if limiter is not None:
            limiter(request)

    return _dep
