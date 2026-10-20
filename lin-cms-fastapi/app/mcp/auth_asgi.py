"""MCP 传输层鉴权中间件（docs/04 §6.1：未授权工具不可见且不可调用）。

纯 ASGI 包装：非有效 Agent Token 的请求在进入 MCP 会话前直接 401，
不暴露工具目录与协议信息。
"""

from typing import Any

from app.core.errors import APIException, UnAuthentication


def wrap_with_agent_auth(app: Any, sessionmaker, authenticate, *, limit_per_minute: int | None = None) -> Any:
    """包住 streamable HTTP 子应用；authenticate(session, plaintext) 失败抛 APIException。

    limit_per_minute 非空时对通过认证的请求做进程内滑动窗口限流（与 REST 面同一实现）。
    """
    from app.core.rate_limit import SlidingWindowCounter

    counter = SlidingWindowCounter()
    minute = 60.0

    async def scoped_app(scope, receive, send):
        if scope["type"] != "http":
            await app(scope, receive, send)
            return
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
        authz = headers.get("authorization", "")
        denied: APIException | None = None
        if not authz.startswith("Bearer lin_agent_"):
            denied = UnAuthentication("需要 Agent Token 认证")
        else:
            plaintext = authz.removeprefix("Bearer ").strip()
            with sessionmaker() as db:
                try:
                    authenticate(db, plaintext)
                    db.commit()
                except APIException as exc:
                    db.rollback()
                    denied = exc
        if denied is None and limit_per_minute is not None:
            ip = (scope.get("client") or ("unknown", 0))[0]
            if not counter.hit(f"mcp:{ip}", limit=limit_per_minute, window=minute):
                body = b'{"error":"rate_limited","code":10140}'
                await send(
                    {
                        "type": "http.response.start",
                        "status": 429,
                        "headers": [
                            (b"content-type", b"application/json"),
                            (b"content-length", str(len(body)).encode()),
                        ],
                    }
                )
                await send({"type": "http.response.body", "body": body})
                return
        if denied is not None:
            body = f'{{"error":"unauthorized","code":{denied.code}}}'.encode()
            await send(
                {
                    "type": "http.response.start",
                    "status": 401,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode()),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return
        await app(scope, receive, send)

    return scoped_app
