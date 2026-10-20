"""应用工厂：装配配置、数据库、路由、静态资源、中间件、异常处理、种子与权限同步。"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import Settings, create_settings
from app.core.errors import (
    APIException,
    InternalServerError,
    MethodNotAllowed,
    ParameterError,
    RouteNotFound,
)
from app.core.logging import RequestContextMiddleware, configure_logging
from app.core.permissions import GUEST_LEVEL, ROOT_LEVEL, sync_permissions
from app.core.rate_limit import default_limiters
from app.core.security import TokenService
from app.db.session import build_engine, build_sessionmaker
from app.models import Base, Group, User, UserGroup
from app.repositories import user_repo


def _flatten_validation_errors(exc: RequestValidationError) -> str:
    parts = []
    for error in exc.errors():
        loc = ".".join(str(item) for item in error.get("loc", ())) or "value"
        parts.append(f"{loc} {error.get('msg', 'invalid')}")
    return " and ".join(parts)


def _register_exception_handlers(app: FastAPI) -> None:
    from app.core.errors import request_line_of

    @app.exception_handler(APIException)
    async def _api_exception(request: Request, exc: APIException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=exc.envelope(request_line_of(request)),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        wrapped = ParameterError(_flatten_validation_errors(exc))
        return JSONResponse(
            status_code=wrapped.status_code,
            content=wrapped.envelope(request_line_of(request)),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code == 404:
            mapped = RouteNotFound()
        elif exc.status_code == 405:
            mapped = MethodNotAllowed()
        else:
            mapped = APIException(exc.detail, code=20000)
            mapped.status_code = exc.status_code
        return JSONResponse(
            status_code=mapped.status_code,
            content=mapped.envelope(request_line_of(request)),
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        mapped = InternalServerError()
        import structlog

        structlog.get_logger("lin.error").exception("unhandled_error", path=request.url.path)
        return JSONResponse(
            status_code=mapped.status_code,
            content=mapped.envelope(request_line_of(request)),
        )


def _ensure_seed(db, settings: Settings) -> None:
    """幂等种子：Root/Guest 分组 + root 用户 + 权限同步。"""
    if db.query(Group).count() == 0:
        db.add(Group(name="Root", info="超级用户组", level=ROOT_LEVEL))
        db.add(Group(name="Guest", info="游客组", level=GUEST_LEVEL))
        db.flush()
    if db.query(User).count() == 0:
        root = user_repo.create_user(db, username="root")
        user_repo.set_password(db, root, settings.bootstrap_admin_password)
        root_group = db.query(Group).filter(Group.level == ROOT_LEVEL, Group.deleted_token == 0).first()
        db.add(UserGroup(user_id=root.id, group_id=root_group.id))
        db.flush()
    sync_permissions(db)
    db.commit()


def _build_lifespan(settings: Settings):
    """宿主 lifespan：建表/种子 + 每次进入重建并开启 MCP 子应用生命周期。"""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        from contextlib import AsyncExitStack

        import app.mcp._state as mcp_state
        from app.mcp.server import build_mcp_app

        if settings.env != "production":
            Base.metadata.create_all(bind=app.state.engine)
        with app.state.sessionmaker() as db:
            _ensure_seed(db, settings)
        # Starlette 不自动运行挂载子 app 的 lifespan；且 streamable session manager
        # 只能 run 一次，故每次宿主 lifespan 进入都重建 MCP 子应用并显式开启其 lifespan。
        async with AsyncExitStack() as stack:
            fresh = build_mcp_app(app.state.sessionmaker, settings)
            owner = getattr(fresh, "lifespan_owner", None)
            if owner is not None:
                await stack.enter_async_context(owner.router.lifespan_context(owner))
            mcp_state.current = fresh
            stack.callback(lambda: setattr(mcp_state, "current", None))
            yield

    return lifespan


def _register_routes(app: FastAPI) -> None:
    from app.api.routers import (
        admin_groups,
        admin_users,
        agent_audit,
        agent_tokens,
        auth,
        content,
        content_records,
        content_types,
        group_content_permissions,
        user,
    )
    from app.api.routers.health import router as health_router

    app.include_router(health_router)
    app.include_router(auth.router)
    app.include_router(user.router)
    app.include_router(admin_users.router)
    app.include_router(admin_groups.router)
    app.include_router(content.log_router)
    app.include_router(content.file_router)
    app.include_router(content.book_router)
    app.include_router(content_types.router)
    app.include_router(group_content_permissions.router)
    app.include_router(agent_tokens.router)
    app.include_router(content_records.router)
    app.include_router(agent_audit.router)


def _patch_openapi_schemes(app: FastAPI) -> None:
    """注入双安全方案登记（浏览器 JWT 与 Agent Token，docs/04 §10）。"""
    original = app.openapi

    def openapi_with_schemes():
        schema = original()
        schema.setdefault("components", {}).setdefault("securitySchemes", {}).update(
            {
                "bearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "description": "浏览器会话 JWT（/cms/user/login 获取，access token）",
                },
                "agentToken": {
                    "type": "http",
                    "scheme": "bearer",
                    "description": "Agent Token（lin_agent_ 前缀；仅内容/Agent 端点与 /mcp 可用）",
                },
            }
        )
        return schema

    app.openapi = openapi_with_schemes


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or create_settings()
    settings.validate_runtime()
    configure_logging("INFO" if settings.env != "development" else "DEBUG")

    app = FastAPI(
        title="Lin CMS",
        version=settings.version,
        lifespan=_build_lifespan(settings),
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
    )
    app.state.settings = settings
    app.state.tokens = TokenService(settings)
    app.state.limiters = default_limiters(settings)

    engine = build_engine(settings.database_url)
    app.state.engine = engine
    app.state.sessionmaker = build_sessionmaker(engine)

    os.makedirs(settings.upload_dir, exist_ok=True)
    app.mount("/assets", StaticFiles(directory=settings.upload_dir), name="assets")

    from app.mcp.server import build_mcp_dispatcher

    app.mount("/mcp", build_mcp_dispatcher(), name="mcp")

    if settings.cors_origins:
        from fastapi.middleware.cors import CORSMiddleware

        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    app.add_middleware(RequestContextMiddleware)
    _register_exception_handlers(app)
    _register_routes(app)
    _patch_openapi_schemes(app)

    if settings.docs_enabled:

        @app.get("/apidoc/openapi.json", include_in_schema=False)
        async def _legacy_openapi():
            return RedirectResponse("/openapi.json")

        @app.get("/apidoc/swagger/", include_in_schema=False)
        async def _legacy_swagger():
            return RedirectResponse("/docs")

    return app


app = create_app()
