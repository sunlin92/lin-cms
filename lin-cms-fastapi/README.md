# Lin CMS FastAPI

Lin CMS 后端的现代重建：FastAPI + SQLAlchemy（同步）。**默认零外部中间件**——SQLite 文件即数据库，限流在进程内，令牌黑名单在数据库表；需要扩展时通过 ORM 一键切换 PostgreSQL/MySQL。

## 技术栈

| 领域 | 选择 |
| --- | --- |
| Web | FastAPI（同步路由，Pydantic v2 校验） |
| ORM | SQLAlchemy 2.x（同步），Alembic 迁移（SQLite batch 模式） |
| 数据库 | SQLite（默认 `data/lincms.db`，WAL + busy_timeout + foreign_keys）；`LIN_DATABASE_URL` 可切 PostgreSQL/MySQL |
| 认证 | PyJWT（HS256，access 1h / refresh 7d，token_version 全量吊销，登出黑名单） |
| 密码 | Argon2id（argon2-cffi），兼容旧 Werkzeug scrypt，登录成功后自动升级 |
| 限流 | 进程内滑动窗口计数器（无 Redis） |
| 日志 | structlog JSON 访问日志 + `lin_log` 行为日志 |

## 快速开始

```bash
cp .env.example .env        # 填入 LIN_SECRET_KEY（必填）
uv sync
uv run alembic upgrade head # 生产部署用迁移建表；开发/测试启动时自动建表
uv run uvicorn app.main:app --reload --port 8000
```

- 默认账号：`root / 123456`（开发/测试；生产用 `LIN_BOOTSTRAP_ADMIN_PASSWORD` 设置强密码）
- 文档：`/docs`、`/redoc`、`/openapi.json`（生产关闭）
- 上传文件：`/assets/...`（存储在 `assets/YYYY/MM/DD/`，MD5 去重）

## 测试

```bash
uv run pytest                 # 178 个用例：契约、RBAC、会话撤销、限流、文件、权限同步、Agent 接入（/api/v1、/mcp、Token、审计）
uv run pytest --cov=app       # 覆盖率 93%
uvx ruff check app tests scripts && uvx ruff format --check app tests scripts
```

## 架构

```
app/
├── core/        # 配置、异常信封、JWT/密码、权限注册表与同步、限流、日志
├── db/          # 引擎/会话（SQLite pragma、内存库 StaticPool）
├── models/      # 10 张表；软删除用 deleted_token 模式（跨库一致）
├── schemas/     # Pydantic 请求/响应 DTO（与旧契约字段一致）
├── repositories/# 数据访问（查询构造，无业务规则）
├── services/    # 业务规则与事务（认证、用户、分组、日志、文件、图书）
└── api/         # 路由（薄层）+ 依赖注入（require_login/root/permission）
```

设计模式：分层 + 仓库模式、服务层、依赖注入（FastAPI Depends）、权限注册表（启动幂等同步）、密码/存储策略（Argon2 + 旧 scrypt 兼容、LocalStorage 接口）、限流依赖工厂。

代码约束：单文件 ≤ 800 行，单函数 ≤ 100 行（当前最大文件 193 行、最大函数 68 行）。

## Agent 接入（/api/v1 + /mcp + CLI）

- `mcp==2.3.0`（官方 v2 SDK）挂载 `/mcp`（Streamable HTTP、无状态、传输层 Agent Token 鉴权）。
- 6 张新表：内容类型/记录/分组内容授权/Agent Token/Token 范围/审计（Alembic `0002`）。
- 内容能力 = 分组授权并集 ∩ Token 静态范围；Root 无内容旁路；Token 明文仅创建时展示一次。
- 维护脚本：`uv run python scripts/cleanup_agent_audit.py`（审计保留期清理）。
- CLI：独立 Go 工程 `../lin-cms-cli/`（`lin-cms init|test|config|mcp|logout`，
  凭证入系统钥匙串；`./build.sh` 一次交叉编译全平台单文件制品）。
- 详见 `docs/04-agent-access-technical-spec.md` 与 `docs/05-agent-access-implementation-plan.md`。

## 契约要点（与旧 Flask 实现对齐）

- 路径：`/health`、`/cms/**`、`/v1/**`；分页 `page` 0-based、`count` 1..15 默认 5。
- 信封 `{message, code, request}`；成功码 0/12/13/14，前端以 `code < 9998` 判成功。
- 24 条权限与旧实现同名同模块；仅 `mount=true` 可分配（日志 3 条 + 删除图书）。
- 已修正的旧行为：Root 按 `level=ROOT` 判定（不再依赖分组 id=1）、行为日志在成功后落库、删除用户清理 identity、方法不允许返回 405、邮箱可在管理员编辑时修改。

## 切换 PostgreSQL / MySQL

```bash
uv add psycopg2-binary   # 或 pymysql
export LIN_DATABASE_URL='postgresql+psycopg2://user:pass@host:5432/lincms'
uv run alembic upgrade head
```

## 环境变量

见 `.env.example`（前缀 `LIN_`）：`SECRET_KEY`（必填）、`DATABASE_URL`、`CORS_ORIGINS`、`LOGIN_CAPTCHA`（需 Pillow）、`UPLOAD_*`、`RATE_*`、`BOOTSTRAP_ADMIN_PASSWORD` 等。
