"""MCP 服务器装配：六内容工具复用同一服务层（docs/04 §6.2/§6.3）。

官方 mcp SDK v2（MCPServer + @mcp.tool + ctx.headers）。工具函数为 async，
同步服务调用经 anyio.to_thread.run_sync 在线程池执行，每请求独立 DB session。
业务异常转 ToolError，消息体为 {"code","message"} 的 JSON——机器可读、无堆栈。
"""

import json
from typing import Any

import anyio
from mcp.server import MCPServer
from mcp.server.mcpserver.context import Context
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations

from app.core.errors import APIException
from app.services import (
    agent_token_service,
    content_type_service,
    dynamic_content_service,
)


def _error_body(exc: APIException) -> str:
    return json.dumps({"code": exc.code, "message": exc.message}, ensure_ascii=False)


def _fields_of(dto: dict) -> dict:
    return {k: v for k, v in dto.items() if k not in ("id", "create_time", "update_time")}


class _Toolkit:
    """把同步服务调用包成线程池执行的工具核，供 async 工具函数调用。"""

    def __init__(self, sessionmaker) -> None:
        self._sessionmaker = sessionmaker

    def _call(self, fn):
        def _sync():
            with self._sessionmaker() as db:
                try:
                    result = fn(db)
                except APIException as exc:
                    raise ToolError(_error_body(exc)) from exc
                # 读路径也要提交：认证产生的 last_used_at 节流写与 token_auth 审计需落库
                db.commit()
                return result

        return anyio.to_thread.run_sync(_sync)

    def principal_of(self, db, headers: dict | None):
        from app.api.deps import AgentTokenPrincipal

        authz = (headers or {}).get("authorization", "")
        if not authz.startswith("Bearer lin_agent_"):
            from app.core.errors import UnAuthentication

            raise UnAuthentication("需要 Agent Token 认证")
        token = agent_token_service.authenticate(db, authz.removeprefix("Bearer ").strip())
        return AgentTokenPrincipal(token_id=token.id, user_id=token.user_id, token_name=token.name)


def build_mcp_server(sessionmaker, *, version: str = "0.1.0") -> MCPServer:
    kit = _Toolkit(sessionmaker)
    server = MCPServer(name="lin-cms", version=version)

    @server.tool(name="list_content_types", description="列出当前 Token 有权访问的内容类型与可用操作")
    async def list_content_types(ctx: Context) -> str:
        headers = dict(ctx.headers) if ctx.headers else None
        return json.dumps(
            await kit._call(lambda db: content_type_service.available_payload(db, kit.principal_of(db, headers))),
            ensure_ascii=False,
            default=str,
        )

    @server.tool(
        name="list_content_records",
        description="分页列出某内容类型的记录（page 从 0 起、count 1..15、filters 字段等值映射最多 5 项、sort 可选）",
    )
    async def list_content_records(
        ctx: Context,
        type_key: str,
        page: int = 0,
        count: int = 5,
        filters: dict[str, Any] | None = None,
        sort: str | None = None,
        order: str = "desc",
    ) -> str:
        headers = dict(ctx.headers) if ctx.headers else None
        params = dict(
            page=max(page, 0), count=min(max(count, 1), 15), filters=filters or {}, sort_key=sort, order=order
        )
        return json.dumps(
            await kit._call(
                lambda db: dynamic_content_service.list_records(db, kit.principal_of(db, headers), type_key, **params)
            ),
            ensure_ascii=False,
            default=str,
        )

    @server.tool(name="get_content_record", description="读取一条内容记录")
    async def get_content_record(ctx: Context, type_key: str, record_id: int) -> str:
        headers = dict(ctx.headers) if ctx.headers else None
        dto = await kit._call(
            lambda db: dynamic_content_service.get_record(db, kit.principal_of(db, headers), type_key, record_id)
        )
        return json.dumps(
            {"record_id": dto["id"], "fields": _fields_of(dto), "create_time": dto.get("create_time")},
            ensure_ascii=False,
            default=str,
        )

    @server.tool(name="create_content_record", description="新增一条内容记录")
    async def create_content_record(ctx: Context, type_key: str, data: dict[str, Any]) -> str:
        headers = dict(ctx.headers) if ctx.headers else None

        def _work(db):
            dto = dynamic_content_service.create_record(db, kit.principal_of(db, headers), type_key, data)
            db.commit()
            return dto

        dto = await kit._call(_work)
        return json.dumps(
            {"record_id": dto["id"], "type_key": type_key, "fields": _fields_of(dto)},
            ensure_ascii=False,
            default=str,
        )

    @server.tool(name="update_content_record", description="按字段合并更新一条内容记录")
    async def update_content_record(ctx: Context, type_key: str, record_id: int, patch: dict[str, Any]) -> str:
        headers = dict(ctx.headers) if ctx.headers else None

        def _work(db):
            dto = dynamic_content_service.update_record(db, kit.principal_of(db, headers), type_key, record_id, patch)
            db.commit()
            return dto

        dto = await kit._call(_work)
        return json.dumps(
            {"record_id": dto["id"], "type_key": type_key, "fields": _fields_of(dto)},
            ensure_ascii=False,
            default=str,
        )

    @server.tool(
        name="delete_content_record",
        description="软删除一条内容记录（破坏性操作：记录被标记删除，仅管理员可恢复）",
        annotations=ToolAnnotations(destructiveHint=True, idempotentHint=False),
    )
    async def delete_content_record(ctx: Context, type_key: str, record_id: int) -> str:
        headers = dict(ctx.headers) if ctx.headers else None

        def _work(db):
            dynamic_content_service.delete_record(db, kit.principal_of(db, headers), type_key, record_id)
            db.commit()

        await kit._call(_work)
        return json.dumps({"record_id": record_id, "type_key": type_key, "deleted": True}, ensure_ascii=False)

    return server


def build_mcp_app(sessionmaker, settings) -> Any:
    """返回带传输层鉴权的 Starlette 子应用（挂载到 /mcp）。"""
    from mcp.server.transport_security import TransportSecuritySettings

    from app.mcp.auth_asgi import wrap_with_agent_auth

    server = build_mcp_server(sessionmaker, version=settings.version)
    # 配置了对外域名时启用 SDK 的 Host/Origin（DNS rebinding）防护；本机/未配置时由
    # 应用 CORS 与反向代理承担来源策略（避免把部署域名写死成 127.0.0.1）。
    transport_security = TransportSecuritySettings(enable_dns_rebinding_protection=False)
    if settings.site_domain:
        transport_security = TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=[settings.site_domain],
        )
    starlette_app = server.streamable_http_app(
        streamable_http_path="/",
        stateless_http=True,
        transport_security=transport_security,
    )
    limit = settings.agent_rate_limit_per_minute if settings.agent_rate_limit_enabled else None
    wrapped = wrap_with_agent_auth(
        starlette_app, sessionmaker, agent_token_service.authenticate, limit_per_minute=limit
    )
    wrapped.lifespan_owner = starlette_app  # 供 FastAPI lifespan 组合（挂载子 app 的 lifespan 不会自动运行）
    return wrapped


def build_mcp_dispatcher() -> Any:
    """每次宿主 lifespan 进入时重建 streamable 子应用（session manager 只能 run 一次）。

    派发器把请求转交给 app.state._mcp_current；无活跃实例时返回 503。
    """

    async def dispatcher(scope, receive, send):
        import app.mcp._state as state

        current = state.current
        if current is None:
            body = b'{"error":"mcp not ready"}'
            await send(
                {
                    "type": "http.response.start",
                    "status": 503,
                    "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return
        await current(scope, receive, send)

    return dispatcher
