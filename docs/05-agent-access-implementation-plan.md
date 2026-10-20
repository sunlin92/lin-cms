# Lin CMS Agent 接入改造：实施计划书

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 [技术规格书](./04-agent-access-technical-spec.md) 交付可配置内容模型 + 动态内容授权 + Agent Token 生命周期 + `/mcp` 端点 + Web 管理界面 + 本机 CLI，全程不改旧契约。

**Architecture:** 后端沿用 router → service → repository → model 分层，新增 6 张数据表与 `/api/v1` 前缀的新 REST 面；MCP 端点与 REST 内容 API 调用同一 service 层（协议只是表现层）。前端在既有 feature 架构上新增 5 个业务域。CLI 为独立 uv 工程，通过 HTTPS 调用内容 API，`stdio` 桥接同一 MCP 工具 schema。

**Tech Stack:** 后端 FastAPI + SQLAlchemy 2（同步）+ Alembic + 官方 `mcp==2.3.0`（v2 API：`MCPServer` / `@mcp.tool()` / `ctx.headers` / `streamable_http_app(stateless_http=True)`）；前端 React 19 + TS strict + Tailwind 4；CLI `mcp` + `httpx` + `keyring` + `argparse`，PyInstaller 单文件打包。

**Spec:** `docs/04-agent-access-technical-spec.md`（本计划从规格取值，执行者需同时读规格）。需求基线：`docs/03-agent-access-requirements.md`。

## 已锁定的实施决策（规格留白处，依据核验结果定死）

1. **MCP SDK**：官方 `mcp==2.3.0`（PyPI，2026-10-02）。v2 中 `FastMCP` 已改名 `MCPServer`（`from mcp.server import MCPServer`）；工具内通过 `ctx: Context` 参数读 `ctx.headers`（streamable-http 传输下携带完整 HTTP 头，含 `Authorization`，已读安装源码 `_streamable_http_modern.py:295` 证实）。挂载方式：`mcp.streamable_http_app(streamable_http_path="/", stateless_http=True)` 返回自带 lifespan（`session_manager.run()`）的 Starlette app，由 `app.mount("/mcp", ...)` 挂载，并在 FastAPI lifespan 内用 `AsyncExitStack` 进入子 app 的 lifespan（Starlette 不自动运行挂载子 app 的 lifespan）。
2. **Agent Token 摘要方案**：采用规格 §12 二选一中的「无 pepper 高熵 SHA-256 摘要」——secret 为 `secrets.token_urlsafe(24)`（≥192 bit 熵），完整 token 形如 `lin_agent_<8位hex前缀>_<secret>`；库存 `sha256(token).hexdigest()`；认证先按 `prefix` 索引取候选，再 `hmac.compare_digest` 逐个比对摘要。**不引入 `LIN_AGENT_TOKEN_PEPPER`**（规格允许并要求删除该变量）。
3. **异步 MCP × 同步 SQLAlchemy**（规格 §13.7）：MCP 工具函数为 async，内部用 `anyio.to_thread.run_sync` 在线程池执行同步 service 调用，每请求独立 DB session。不引入异步数据库驱动。
4. **CLI 位置**：`lin-cms-fastapi/cli/` 独立 uv 工程（自带 `pyproject.toml` 与 `uv.lock`，依赖 `mcp`/`httpx`/`keyring`，与服务端依赖隔离）。命令解析用标准库 `argparse`（零额外依赖，避免把 typer/click 打进单文件制品）。
5. **内容过滤实现**（规格 §3.2/§5.2）：等值过滤与排序在应用层完成——按 `id` 倒序 keyset 分批加载候选（每批 200 行），单请求最多扫描 `LIN_AGENT_CONTENT_FILTER_SCAN_LIMIT`（默认 1000）行；命中上限时响应带 `scan_truncated: true` 且 `total` 为已扫描匹配数，前端提示"结果可能不完整"。禁止无界扫描。
6. **`/api/v1` 响应形态**（规格 §10）：`/api/v1/admin/**`、`/api/v1/agent-tokens/**`、`/api/v1/content-types/available` 成功走信封 `{message, code: 0, request}`；`/api/v1/content/**` 成功返回明确 DTO（列表 `{items, page, count, total, total_page, scan_truncated}`，单条为字段对象）；所有错误统一走既有 `APIException` 信封。前端类型沿用**手写 `types.ts`** 约定（偏离规格 §10 的 openapi-typescript 表述，最终任务同步规格措辞）。
7. **新错误码段**：`10300–10399`（既有最大业务码 10200），在 `app/core/errors.py` 登记。
8. **git 状态**：本计划执行时工作区尚无 git 仓库，任务以「聚焦测试通过 + ruff/vitest/typecheck」收尾，无 commit 步骤；2026-10-20 起工作区根目录已初始化为唯一 monorepo 仓库，后续增量按仓库提交约定执行。

## Global Constraints

- 零外部中间件：不引入 Redis/MQ/Celery/外部缓存/搜索；SQLite 默认，ORM 层可移植 PostgreSQL/MySQL。
- 旧契约不变：`/cms/**`、`/v1/**`、`/health` 路径与线格式、信封 `{message, code, request}`、`code < 9998` 成功、0-based 分页（`count` 1..15 默认 5）、24 项权限同名同模块、Root 按 `level=ROOT` 判定。
- 启动权限同步 `sync_permissions()` 只管理代码注册的 24 项固定权限，永不触碰动态内容授权表。
- Root 无内容旁路：内容 API/MCP/Agent Token 一律走显式授权；旧 `/cms/admin/**` 的 Root 旁路保留。
- 单文件 ≤ 800 行，单函数 ≤ 100 行；分层单向依赖 router → service → repository。
- 安全默认值：Token 明文仅创建响应一次展示；库中仅摘要；审计与内容写同事务；日志/错误/审计不出现明文 Token、Authorization 头或完整内容载荷。
- 配置项 `LIN_` 前缀，默认值与规格 §12 一致（除删除 Pepper）：`AGENT_TOKEN_DEFAULT_TTL_DAYS=90`、`AGENT_TOKEN_MAX_TTL_DAYS=365`、`AGENT_TOKEN_MAX_ACTIVE_PER_USER=20`、`AGENT_AUDIT_RETENTION_DAYS=180`（正整数校验）、`AGENT_CONTENT_MAX_RECORD_BYTES=65536`、`AGENT_CONTENT_MAX_FIELDS=100`、`AGENT_RATE_LIMIT_ENABLED=true`，新增 `AGENT_CONTENT_FILTER_SCAN_LIMIT=1000`。
- 改接口后必须 `uv run python scripts/export_openapi.py` 更新 `contracts/openapi.json`。
- 文档全部简体中文；测试先行（TDD）；声明完成前必须运行验证命令并报告缺口。

## Review Focus

规格未逐条点名、但最容易伤害使用者的五类输入/失效模式（每条的钉死测试归属对应任务）：

1. **Token 明文泄漏面**：列表/审计/错误响应/日志/CLI 输出任何位置出现完整 token → Task 8/10/19 各有「断言响应与日志不含明文」的测试。
2. **授权收窄不即时**：管理员改分组内容权限或吊销 Token 后，旧凭证下一次请求仍成功 → Task 6/8 的运行时交集与吊销即时生效测试。
3. **schema 演进破坏存量数据**：把字段改必填/删字段/收窄枚举后旧记录变非法 → Task 4 的存量记录重校验拒绝测试。
4. **过滤触发无界扫描**：大表等值过滤一次载入全表 → Task 9 的 scan cap 与 `scan_truncated` 测试。
5. **MCP 未授权探测**：无凭证请求 `/mcp` 的 initialize/tools-list 泄漏工具目录 → Task 11 的中间件 401 测试（未认证不可见且不可调用）。

---

### Task 1: 配置项与错误码底座

**Files:**
- Modify: `lin-cms-fastapi/app/core/config.py`
- Modify: `lin-cms-fastapi/app/core/errors.py`
- Test: `lin-cms-fastapi/tests/test_agent_config.py`

**Interfaces:**
- Produces: `Settings` 新字段 `agent_token_default_ttl_days: int = 90`、`agent_token_max_ttl_days: int = 365`、`agent_token_max_active_per_user: int = 20`、`agent_audit_retention_days: int = 180`、`agent_content_max_record_bytes: int = 65536`、`agent_content_max_fields: int = 100`、`agent_rate_limit_enabled: bool = True`、`agent_content_filter_scan_limit: int = 1000`；`validate_runtime()` 追加校验（见步骤）。异常类 `AgentTokenInvalid(401,10300)`、`AgentTokenExpired(401,10301)`、`AgentTokenRevoked(401,10302)`、`ContentForbidden(403,10310)`、`ContentTypeArchived(403,10311)`、`ContentTypeNotFound(404,10320)`、`ContentRecordNotFound(404,10321)`、`ContentSchemaInvalid(400,10330)`、`ContentDataInvalid(400,10331)`、`ContentSchemaBreaking(400,10332)`、`AgentTokenLimitReached(400,10340)`、`AgentTokenScopeInvalid(400,10341)`、`ContentPayloadTooLarge(413,10350)`。

- [ ] **Step 1: 写失败测试**

`tests/test_agent_config.py::test_agent_settings_defaults`：构造 `Settings(secret_key="x")`，断言上述 8 个默认值；`test_agent_settings_validation`：`agent_audit_retention_days=0` 与 `agent_token_default_ttl_days > agent_token_max_ttl_days` 时 `validate_runtime()` 抛 `ValueError`；`test_agent_error_codes`：`AgentTokenInvalid().code == 10300`、`ContentForbidden().status_code == 403` 等（遍历断言 code 唯一且 ≥10300）。

- [ ] **Step 2: 运行确认失败** — `uv run pytest tests/test_agent_config.py -v`（AttributeError/ImportError）
- [ ] **Step 3: 实现** — config.py 增字段与校验；errors.py 在 `MethodNotAllowed` 后追加 10300 段类
- [ ] **Step 4: 运行确认通过 + ruff** — `uv run pytest tests/test_agent_config.py && uvx ruff check app/core`

### Task 2: 数据模型与迁移（6 张表）

**Files:**
- Create: `lin-cms-fastapi/app/models/content_type.py`（`ContentType`、`ContentRecord`、`GroupContentPermission`）
- Create: `lin-cms-fastapi/app/models/agent_token.py`（`AgentToken`、`AgentTokenScope`、`AgentAuditLog`）
- Modify: `lin-cms-fastapi/app/models/__init__.py`（导出新模型）
- Create: `lin-cms-fastapi/alembic/versions/0002_agent_content_tables.py`
- Test: `lin-cms-fastapi/tests/test_agent_models.py`

**Interfaces:**
- Produces: 字段与规格 §3 完全一致——`ContentType{id,key String(80) unique,name String(100),description String(500) nullable,schema_json Text,status String(16) default "active",create_time,update_time}`；`ContentRecord{id,content_type_id FK idx,data_json Text,deleted_token Integer default 0,deleted_at nullable,create_time,update_time}`；`GroupContentPermission{id,group_id FK idx,content_type_id FK idx,can_read,can_create,can_update,can_delete Boolean,UniqueConstraint(group_id,content_type_id)}`；`AgentToken{id,user_id FK idx,name String(100),prefix String(16) idx,secret_digest String(128) unique,expires_at 非空,last_used_at nullable,revoked_at nullable,create_time}`；`AgentTokenScope{id,agent_token_id FK idx,content_type_id,can_read/can_create/can_update/can_delete,UniqueConstraint(agent_token_id,content_type_id)}`；`AgentAuditLog{id,agent_token_id nullable,user_id,content_type_key String(80),record_id nullable,action String(32),success Boolean,error_code nullable,request_id String(64) nullable,create_time}`。布尔列 `default=False`，非空。
- Consumes: `app/models/Base`、既有 `deleted_token` 软删模式与 `utctnow` 工具（沿用 Book/FileRecord 写法）。

- [ ] **Step 1: 写失败测试** — `test_agent_models.py::test_tables_created_and_constraints`：内存库 `Base.metadata.create_all` 后向 `lin_content_type` 插入重复 `key` 触发 IntegrityError；`lin_group_content_permission` 重复 `(group_id, content_type_id)` 触发 IntegrityError；`lin_agent_token.secret_digest` 唯一约束同理；`test_foreign_keys_sqlite`：开启 `PRAGMA foreign_keys` 后插入非法 `user_id` 的 token 报错。
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现模型与迁移** — 迁移 `0002` 用 `op.create_table` 建 6 表 + 索引 + 唯一约束（SQLite 无需 batch）；`downgrade` 反向 drop。表名字面量与模型 `__tablename__` 一致。
- [ ] **Step 4: 迁移验证** — `uv run alembic upgrade head`（临时 `LIN_DATABASE_URL=sqlite:///./data/_plan_check.db`，验证后删除该文件）再 `alembic downgrade -1` / `upgrade head` 往返成功
- [ ] **Step 5: 测试通过 + ruff** — `uv run pytest tests/test_agent_models.py && uvx ruff check app/models alembic`

### Task 3: 内容 schema 校验器

**Files:**
- Create: `lin-cms-fastapi/app/schemas/content_type.py`（含字段规格与校验器）
- Test: `lin-cms-fastapi/tests/test_content_schema.py`

**Interfaces:**
- Produces:
  - `RESERVED_FIELD_KEYS = {"id","type","key","status","create_time","update_time","deleted","deleted_at","deleted_token","record_id"}`；
  - `class FieldSpec(BaseModel)`：`key: str`（`^[a-z][a-z0-9_]{0,49}$` 且不在保留字）、`label: str(min_length=1,max_length=50)`、`type: Literal["text","textarea","number","boolean","date","select"]`、`required: bool=False`、`options: list[str] | None`（仅 select，去重、每项 ≤50 字符、1..50 项）、`max_length: int|None`（仅 text/textarea，≤5000）、`min_/max_: float|None`（仅 number，`min_<=max_`）；`model_validator` 拒绝类型不匹配的属性组合。
  - `validate_type_schema(fields: list[FieldSpec], max_fields: int) -> list[FieldSpec]`：字段数 ≤ max_fields、key 去重。
  - `validate_type_key(key: str) -> str`：`^[a-z][a-z0-9-]{1,79}$`。
  - `build_record_model(type_key: str, fields: list[FieldSpec]) -> type[BaseModel]`：`pydantic.create_model` 动态组装（text/textarea→str、number→float、boolean→bool、date→`datetime.date`、select→Literal[options]；required 控制 Optional/默认值；max_length/min/max 进约束），输出模型校验并**只保留 schema 声明字段**（额外字段拒绝）。
  - `serialize_record(data: dict) -> str`：`json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",",":"))`（确定性序列化，供过滤与存储共用）。
- Consumes: Task 1 的 `ContentSchemaInvalid`。

- [ ] **Step 1: 写失败测试** — 覆盖规格 §11.1：六种字段类型各一对有效/无效样例；`required` 缺失报错；非法 key（大写、保留字、前导数字）；select 选项重复/为空/给非 select 传 options；number `min>max`；字段数超 `max_fields`；`build_record_model` 拒绝未声明字段、拒绝非有限数值（NaN/Inf）、date 非法串。所有错误统一抛 `ContentSchemaInvalid`/`ContentDataInvalid`。
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现**（Pydantic v2 validator + `create_model`；Literal 由 `Literal[tuple(options)]` 构造）
- [ ] **Step 4: 测试通过 + ruff**

### Task 4: 内容类型服务与管理 API

**Files:**
- Create: `lin-cms-fastapi/app/services/content_type_service.py`
- Create: `lin-cms-fastapi/app/api/routers/content_types.py`
- Create: `lin-cms-fastapi/app/schemas/content_type.py` 内追加请求/响应 DTO（同文件行数可控，超 800 再拆）
- Modify: `lin-cms-fastapi/app/main.py`（include_router）
- Test: `lin-cms-fastapi/tests/test_content_types.py`

**Interfaces:**
- Produces（service，均收 `db: Session` 首参）：
  - `create_type(db, *, key, name, description, fields: list[dict]) -> ContentType`
  - `update_type(db, type_id, *, name, description, fields) -> ContentType`：key 不可改（改则 `ParameterError`）；schema 变更时把该类型全部 `deleted_token=0` 记录逐条用新 `build_record_model` 重校验，任一失败抛 `ContentSchemaBreaking`（message 带首个失败 record_id 与失败数量）。
  - `archive_type/restore_type(db, type_id) -> ContentType`；`get_type(db, type_id)`；`list_types(db, page, count)`；`count_records(db, type_id) -> int`。
  - `get_active_type_by_key(db, key) -> ContentType`（404→`ContentTypeNotFound`）。
- Produces（路由，前缀 `/api/v1`，Tag `agent-content-types`）：
  - `GET /api/v1/content-types/available`（登录 JWT 或 Agent Token，Task 6 落地前先挂 `get_current_auth`，Task 6 改为 `get_content_principal`）→ 信封，`data` 项 `{id,key,name,description,ops:["read",...],field_count}`。
  - `GET/POST /api/v1/admin/content-types`、`GET/PUT /api/v1/admin/content-types/{type_id}`、`POST .../archive`、`POST .../restore`（全部 Root JWT，复用 `require_root`）→ 信封 code 0。
- Consumes: Task 1 错误码、Task 2 模型、Task 3 校验器、既有 `require_root`、`success_envelope`。

- [ ] **Step 1: 写失败测试**（httpx + 既有 conftest 的 `client`/`root_headers` 夹具风格）— `test_create_list_update_archive_flow`：Root 建 `product` 类型（title text 必填 / price number / published boolean）→ 非 Root 403 → 重复 key 400（`Duplicated`）→ 更新 name 成功 → 改 key 拒绝 → `archive` 后 `available` 不再出现 → `restore` 回来；`test_schema_evolution_rejects_breaking_change`：先建记录再用「title 改必填缺失字段」/「删字段」schema 更新 → 10332；新增**可选**字段演进成功。
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现 service 与路由**（路由薄层，业务全在 service；单函数 ≤100 行）
- [ ] **Step 4: 测试通过 + ruff + 全量回归** — `uv run pytest`

### Task 5: 分组内容权限 + 权限同步隔离

**Files:**
- Create: `lin-cms-fastapi/app/services/group_content_permission_service.py`
- Create: `lin-cms-fastapi/app/api/routers/group_content_permissions.py`
- Modify: `lin-cms-fastapi/app/main.py`
- Test: `lin-cms-fastapi/tests/test_group_content_permissions.py`

**Interfaces:**
- Produces（service）：
  - `get_group_grants(db, group_id) -> list[GroupContentPermission]`
  - `replace_group_grants(db, group_id, entries: list[dict]) -> None`：整体事务化全量替换（遗漏即撤销）；`entries` 元素 `{content_type_id, can_read, can_create, can_update, can_delete}`；空 `ops` 集合的条目跳过不落库；`group_id` 必须指向现存分组（含 ROOT 组——用 `db.query(Group).get` 直查，绕过旧列表接口对 Root 的隐藏）。
  - `user_caps(db, user_id, content_type_id) -> set[str]`：用户全部有效分组授权并集（{"read","create","update","delete"}）。
- Produces（路由，Root JWT）：`GET /api/v1/admin/groups/{group_id}/content-permissions` → 信封 data 为条目数组；`PUT` 同路径全量替换 → 信封 code 0。
- Consumes: Task 2 模型；既有 `Group`/`group_ids_of_user`。

- [ ] **Step 1: 写失败测试** — `test_full_replace_semantics`：PUT 两组授权 → GET 返回一致 → 再 PUT 只留一组 → 被遗漏组授权消失；`test_root_group_grantable`：对隐藏 ROOT 组（id=1）PUT/GET 成功；`test_guest_group_grantable`；非 Root 403；`test_sync_permissions_never_touches_dynamic_grants`：配置授权后调用 `sync_permissions(db)`，`lin_group_content_permission` 行数与内容不变（含从 `PERMISSION_REGISTRY` 删一个键模拟代码变更的再同步场景）。
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现**（`replace_group_grants` 内 delete+bulk insert，同一事务）
- [ ] **Step 4: 测试通过 + ruff**

### Task 6: 内容能力授权服务（交集算法）

**Files:**
- Create: `lin-cms-fastapi/app/services/content_capability_service.py`
- Modify: `lin-cms-fastapi/app/api/deps.py`（新增 `AgentTokenPrincipal`、`get_agent_principal`、`get_content_principal`）
- Modify: `lin-cms-fastapi/app/api/routers/content_types.py`（`available` 改用 `get_content_principal`）
- Test: `lin-cms-fastapi/tests/test_content_capability.py`

**Interfaces:**
- Produces:
  - `@dataclass AgentTokenPrincipal: token_id: int; user_id: int; token_name: str`——**不含 Root 标志与任何系统权限**。
  - 依赖 `get_agent_principal(request, db)`：解析 `Authorization: Bearer lin_agent_...`，失败抛 Task 1 的 401 类；`get_content_principal(...)`：Bearer 以 `lin_agent_` 开头走 agent 认证，否则走既有 `get_current_auth`（返回 `UserSessionPrincipal(user_id, is_root)` dataclass，也定义在本任务）。
  - `effective_caps(db, principal, content_type_id) -> set[str]`：session → `user_caps`（模型须 active）；agent → `user_caps ∩ token 静态 scope`，且 token 未吊销未过期、模型 active。
  - `require_cap(db, principal, content_type_id, op: str) -> None`：不在有效能力抛 `ContentForbidden`（403）；模型归档时对写操作抛 `ContentTypeArchived`。
- Consumes: Task 5 `user_caps`；Task 2 scope 表。

- [ ] **Step 1: 写失败测试** — `test_union_across_groups`（用户入两组，能力并集）；`test_revoke_takes_effect_immediately`（授权后改分组授权为空，同一 token 下次请求 403）；`test_token_scope_intersection`（用户有 read+create，token scope 只选 read → 有效仅 read）；`test_root_no_bypass`（Root 用户无内容授权 → 403）；`test_archived_type_blocks_write`；`test_agent_principal_has_no_root_flag`（结构断言 dataclass 字段）。
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现**（token 认证细节在 Task 7 service，本任务的 `get_agent_principal` 先按 prefix+digest 直查——若 Task 7 尚未落地则本任务与 Task 7 顺序对调执行：**执行顺序调整为先 Task 7 再 Task 6**）
- [ ] **Step 4: 测试通过 + ruff**

### Task 7: Agent Token 服务

**Files:**
- Create: `lin-cms-fastapi/app/services/agent_token_service.py`
- Create: `lin-cms-fastapi/app/repositories/agent_repo.py`
- Test: `lin-cms-fastapi/tests/test_agent_tokens_service.py`

**Interfaces:**
- Produces（service）：
  - `generate_token() -> tuple[plaintext, prefix, digest]`：`prefix=secrets.token_hex(4)`、secret=`secrets.token_urlsafe(24)`、plaintext=`f"lin_agent_{prefix}_{secret}"`、`digest=sha256(plaintext).hexdigest()`。
  - `create_token(db, *, user_id, name, expires_at, scope_entries) -> dict`：scope 必须为「该用户当前 `user_caps` ∩ 显式勾选」的子集（越权项抛 `AgentTokenScopeInvalid`，空集同样抛）；有效 active token 数达 `agent_token_max_active_per_user` 抛 `AgentTokenLimitReached`；写库返回 `{"token_id", "plaintext"(仅此一次), "prefix", "expires_at", "scope"}`。
  - `authenticate(db, plaintext) -> AgentToken`：prefix 取候选 → `hmac.compare_digest` 比对 → 校验 revoked（`AgentTokenRevoked`）/过期（`AgentTokenExpired`）/无候选（`AgentTokenInvalid`）；成功后节流更新 `last_used_at`（5 分钟内不重复写）；认证成功与失败均写审计（action=`token_auth`）。
  - `revoke_token(db, token_id, *, operator_id, reason)`、`revoke_all_for_user(db, user_id, *, reason)`、`list_tokens(db, user_id)`（只元数据）、`admin_list_tokens(db, page, count, *, user_id=None)`。
- Consumes: Task 5 `user_caps`、Task 2 模型；Settings TTL 字段。

- [ ] **Step 1: 写失败测试** — 规格 §11.1 Token 行全表：创建返回明文且库中只有摘要（查库断言）；scope 越权拒绝；空 scope 拒绝；默认/最大 TTL 边界（超 365 天拒绝）；数量上限第 21 个拒绝；authenticate 成功/错 prefix/错 secret/吊销/过期；恒定时间（`hmac.compare_digest` 被调用——用 monkeypatch 计数）；`last_used_at` 5 分钟节流；改吊销后立即失效。
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现**（repo 层只做查询：`find_by_prefix`、`active_count_for_user`、`scopes_of`）
- [ ] **Step 4: 测试通过 + ruff**

### Task 8: 用户 Token API + 吊销挂钩

**Files:**
- Create: `lin-cms-fastapi/app/api/routers/agent_tokens.py`
- Modify: `lin-cms-fastapi/app/services/auth_service.py`（改密吊销挂钩）
- Modify: `lin-cms-fastapi/app/services/user_service.py`（管理员重置密码、删除用户挂钩——按现有方法名定位）
- Modify: `lin-cms-fastapi/app/main.py`
- Test: `lin-cms-fastapi/tests/test_agent_tokens_api.py`

**Interfaces:**
- Produces（路由，本人 JWT）：
  - `GET /api/v1/agent-tokens` → 信封，项 `{id,name,prefix,expires_at,last_used_at,revoked_at,create_time,scope:[{content_type_id,content_type_key,ops}]}`——**无 digest/plaintext 字段**。
  - `POST /api/v1/agent-tokens`：body `{name, ttl_days?, scope:[{content_type_id, ops}]}` → 信封 data 含一次性 `token` 明文；响应模型字段命名与 OpenAPI 登记一致。
  - `DELETE /api/v1/agent-tokens/{token_id}` → 本人 token 吊销（他人 id 404 统一消息）；`GET /api/v1/admin/agent-tokens`（Root 只读分页）；`POST /api/v1/admin/agent-tokens/{id}/revoke`（Root 代吊销，审计记 operator）。
- Produces（挂钩）：`change_password`、管理员重置密码、删除用户三处调用 `revoke_all_for_user`，reason 分别为 `"password_changed"`/`"password_reset"`/`"user_deleted"`。
- Consumes: Task 7 service。

- [ ] **Step 1: 写失败测试** — 创建→列表不含明文也不含 digest；DELETE 后 authenticate 401；用户 A 不能删/看用户 B 的 token（B 的 id 对 A 返回 404）；改密后旧 token 全失效；管理员重置他人密码后失效；删除用户后失效；Root 代吊销成功且审计有 operator；E2E 断言：POST 响应 JSON 序列化后 `lin_agent_` 出现且仅出现一次（一次性语义）。
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现**（路由薄层；挂钩为 3 处各 1-2 行调用 + 既有测试补断言）
- [ ] **Step 4: 测试通过 + ruff + 全量回归 `uv run pytest`**

### Task 9: 内容记录服务与 API

**Files:**
- Create: `lin-cms-fastapi/app/services/dynamic_content_service.py`
- Create: `lin-cms-fastapi/app/repositories/content_repo.py`
- Create: `lin-cms-fastapi/app/api/routers/content_records.py`
- Modify: `lin-cms-fastapi/app/main.py`
- Test: `lin-cms-fastapi/tests/test_content_records.py`

**Interfaces:**
- Produces（service）：
  - `create_record(db, principal, type_key, data: dict) -> dict`：`require_cap(create)` → `build_record_model` 校验 → 序列化字节数 ≤ `agent_content_max_record_bytes`（超限 `ContentPayloadTooLarge`）→ 插入 → 审计同事务 → 返回 `{id, fields..., create_time, update_time}`。
  - `get_record(db, principal, type_key, record_id)`：`require_cap(read)`；无权与不存在统一 `ContentRecordNotFound`（降枚举）；返回同上 DTO。
  - `update_record(db, principal, type_key, record_id, patch: dict)`：合并后整记录重校验（PATCH 字段须属于 schema）。
  - `delete_record(db, principal, type_key, record_id)`：软删（`deleted_token=id, deleted_at=utcnow`）。
  - `list_records(db, principal, type_key, *, page, count, filters: dict[str, Any], sort_key, order) -> dict`：过滤值按字段类型转换（非法 → `ParameterError`）；repo 按 `id` 倒序 keyset 分批（200/批，总扫描 ≤ `agent_content_filter_scan_limit`）取候选 → 应用层等值过滤 → 排序（白名单：text/number/date/boolean 字段）→ 内存分页 → `{items, page, count, total, total_page, scan_truncated}`；`total` 为扫描窗口内匹配数。
  - 所有写操作与审计同一事务（Task 10 的 `agent_audit_service.record`，本任务先以审计服务接口桩调用，Task 10 落地实现——桩为同名函数写 `lin_agent_audit_log` 行，可先内联，Task 10 抽走）。
- Produces（路由）：`GET/POST /api/v1/content/{type_key}`、`GET/PATCH/DELETE /api/v1/content/{type_key}/{record_id}`，鉴权 `get_content_principal`；查询参数 `page,count,sort,order` + `f_<field_key>=...`（≤5 个，超出 `ParameterError`）；DTO 成功（无信封），错误走异常信封。
- Consumes: Task 3/6/7；`agent_rate_limit_enabled` 时对 5 条路由套既有进程内限流器工厂（按 `principal.user_id` 键）。

- [ ] **Step 1: 写失败测试** — 规格矩阵：session 与 agent token 双通道 CRUD；未授权操作 403；token scope 只读时写 403；跨用户 token 不能读他人**无权类型**（有共同授权类型的数据可见——本系统按类型授权，不按行隔离，测试明确固化此语义）；过滤等值（字符串/数字/布尔/日期）、非法过滤值、>5 个过滤字段、非法排序字段拒绝、未声明字段 POST 拒绝、64KiB 超限 413、软删后 GET 404、scan cap（造 25 条，`filter_scan_limit` monkeypatch 为 10 → `scan_truncated=true`）；**测试断言任何响应不含 `data_json` 原文键与 `deleted_token` 内部字段**。
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现**
- [ ] **Step 4: 测试通过 + ruff + 全量回归**

### Task 10: 审计服务、管理查询与保留清理

**Files:**
- Create: `lin-cms-fastapi/app/services/agent_audit_service.py`
- Create: `lin-cms-fastapi/app/api/routers/agent_audit.py`
- Create: `lin-cms-fastapi/scripts/cleanup_agent_audit.py`
- Modify: `lin-cms-fastapi/app/main.py`；Task 9 中审计桩改为正式调用
- Test: `lin-cms-fastapi/tests/test_agent_audit.py`

**Interfaces:**
- Produces：`record(db, *, token_id, user_id, content_type_key, action, success, record_id=None, error_code=None, request_id=None)`（**不收 payload/secret 参数**）；`query(db, page, count, *, token_id=None, action=None, start=None, end=None)`；`cleanup_expired(db, retention_days) -> int`。路由 `GET /api/v1/admin/agent-audit`（Root，分页+过滤，信封）。脚本打印清理行数并以退出码 0 结束（供 cron/手动）。
- Consumes: Task 2 `AgentAuditLog`。

- [ ] **Step 1: 写失败测试** — 成功/失败操作各产生一行审计；审计行不含字段值与 token 串（查库断言列值）；分页与三类过滤；`cleanup_expired` 只删过期行；Task 9 写路径事务原子性（monkeypatch 审计 insert 抛错 → 内容写一并回滚，响应 500 且库无新记录）；非 Root 403。
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现**
- [ ] **Step 4: 测试通过 + `uv run python scripts/cleanup_agent_audit.py` 冒烟 + ruff**

### Task 11: `/mcp` 端点（6 工具 + 传输层鉴权）

**Files:**
- Create: `lin-cms-fastapi/app/mcp/__init__.py`、`lin-cms-fastapi/app/mcp/server.py`（`build_mcp_app(settings) -> Starlette`）
- Create: `lin-cms-fastapi/app/mcp/auth_asgi.py`（ASGI 鉴权中间件）
- Modify: `lin-cms-fastapi/app/main.py`（mount `/mcp` + lifespan 组合）
- Test: `lin-cms-fastapi/tests/test_mcp_endpoint.py`

**Interfaces:**
- Produces:
  - `MCPServer(name="lin-cms", version=settings.version)`；6 个工具 `list_content_types / list_content_records / get_content_record / create_content_record / update_content_record / delete_content_record`，`delete_content_record` 以 `annotations` 标注破坏性（`destructiveHint=True`），描述说明"软删除、可由管理员恢复"；输入 schema 与 Task 9 查询一致（filter 为对象参数、limit 映射 count 1..15、无 cursor）。
  - 每个工具 `ctx: Context` → `ctx.headers.get("authorization")` → `anyio.to_thread.run_sync` 执行同步 service 调用；失败抛业务异常时捕获并转 `isError=True` 结构化文本 `{"code": <错误码>, "message": ...}`（不含堆栈/内部细节）；结果含 `record_id/type_key/fields/时间戳`，不含用户主体、token 前缀。
  - `auth_asgi.py`：包住 streamable app 的纯 ASGI 中间件——非 `Bearer lin_agent_` 或认证失败（吊销/过期/不存在）→ 直接 `401 JSON {"error":"unauthorized"}`（不进入 MCP 会话）；Host/Origin 校验沿用应用全局 CORS 中间件（挂载子 app 在 CORS 内层生效）。
  - `build_mcp_app`：`mcp.streamable_http_app(streamable_http_path="/", stateless_http=True, host=settings.site_domain or "127.0.0.1")` → wrap 中间件；`main.py` lifespan 里 `AsyncExitStack` 进入 `mcp_app.lifespan(mcp_app)`；`app.mount("/mcp", wrapped, name="mcp")`。
- Consumes: Task 7 `authenticate`、Task 9 service、Task 6 `effective_caps`。

- [ ] **Step 1: 写失败测试** — httpx ASGITransport 直连 + 手写 JSON-RPC 帧序列（`initialize` → `notifications/initialized` → `tools/list` → `tools/call`，解析 SSE `data:` 行或 JSON 体）：无凭证 initialize 401（工具目录不可见）；有效 token `tools/list` 返回 6 工具；`list_content_types` 只含授权类型；未授权类型调用返回 `isError=true` + `code=10310`；create→get→update→delete 闭环写审计；SSE 与 JSON 双响应形态解析 helper 复用。`test_no_plaintext_in_mcp_error`：错误结果不含 `lin_agent_` 串。
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 实现**（工具函数体 ≤100 行；sync 服务调用统一 `_run_sync` helper）
- [ ] **Step 4: 测试通过 + ruff + 全量回归 `uv run pytest`**

### Task 12: OpenAPI 导出与契约登记

**Files:**
- Modify: `contracts/openapi.json`（生成物）
- Verify: `lin-cms-fastapi/tests/test_openapi_contract.py`

**Interfaces:**
- Produces: `contracts/openapi.json` 含全部 `/api/v1/**` 路径；`securitySchemes` 双定义：`bearerAuth`（JWT，描述"浏览器会话"）与 `agentToken`（Bearer lin_agent_，描述"仅内容/Agent 端点"）。

- [ ] **Step 1: 写失败测试** — 断言 openapi.json 含 `/mcp` 不出现在 paths（挂载子 app 不进 OpenAPI——断言其不出现以防误挂）；`/api/v1/content/{type_key}` GET 有 `agentToken` security 声明；旧 `/cms/**` 路径数量与关键样例不变（与 git 前基线快照对比——无 git，改为断言固定路径集合存在）。
- [ ] **Step 2: 运行 `uv run python scripts/export_openapi.py` 并核对测试通过**

### Task 13: 前端 API 封装与类型

**Files:**
- Create: `lin-cms-react/src/lib/api/agent-types.ts`、`lin-cms-react/src/lib/api/agent.ts`
- Test: `lin-cms-react/src/lib/api/__tests__/agent.test.ts`

**Interfaces:**
- Produces（types）：`ContentTypeSummary/ContentTypeDetail/FieldSpec/GroupContentGrant/AgentTokenMeta/AgentTokenCreated/ContentRecordDTO/ContentListResult/AuditRow` 及查询参数类型（与 Task 4-10 DTO 字段逐一对应，含 `scan_truncated`）。
- Produces（api）：`listAvailableContentTypes/listAdminContentTypes/createContentType/updateContentType/archiveContentType/restoreContentType/getGroupContentPermissions/replaceGroupContentPermissions/listAgentTokens/createAgentToken/revokeAgentToken/adminListAgentTokens/adminRevokeAgentToken/listContentRecords/getContentRecord/createContentRecord/updateContentRecord/deleteContentRecord/listAgentAudit`——全部经 `src/lib/api/client.ts` 的 `request`，无裸 fetch。
- Consumes: 既有 `client.ts`。

- [ ] **Step 1: 写失败测试** — vitest mock fetch：信封接口解析出 data；DTO 接口直接返回 JSON；POST 创建 token 返回含 `token` 字段的对象；错误传播 `ApiError`。
- [ ] **Step 2: 确认失败 → 实现 → 通过 + `pnpm typecheck && pnpm lint`**

### Task 14: 前端——内容类型管理（Root）

**Files:**
- Create: `lin-cms-react/src/features/content-types/ContentTypeListPage.tsx`、`ContentTypeWizardPage.tsx`
- Modify: `lin-cms-react/src/routes.tsx`（`/admin/content-types` 列表、`/admin/content-types/new|:id/edit` 向导，admin 直通）
- Test: `lin-cms-react/src/features/content-types/__tests__/ContentTypeWizard.test.tsx`

**Interfaces:**
- Produces: 列表页（名称/key/状态/记录数/归档恢复操作）；三步向导（基本信息 → 字段编辑器（增删行、类型选择、必填开关、select 选项、数值范围）→ 预览 JSON + 提交）；字段编辑器组件 `FieldEditor` 本文件内实现。
- Consumes: Task 13 api；既有 `ui/` 组件与 sonner。

- [ ] **Step 1: 写失败测试** — 渲染向导填两字段提交，断言 `createContentType` 载荷 `{key:"product",name:...,fields:[...]}`；重复字段 key 时前端校验拦截；服务端 400（破坏性变更）时展示 message。
- [ ] **Step 2: 确认失败 → 实现 → 通过 + typecheck + lint**

### Task 15: 前端——分组内容权限页签

**Files:**
- Create: `lin-cms-react/src/features/groups/GroupContentPermissionPage.tsx`
- Modify: `lin-cms-react/src/routes.tsx`（`/admin/groups/:groupId/content-permissions`，admin 直通）；`GroupListPage.tsx` 行操作加入口
- Test: `lin-cms-react/src/features/groups/__tests__/GroupContentPermission.test.tsx`

**Interfaces:**
- Produces: 页面 = 类型矩阵（行=active 内容类型，列=读/建/改/删复选）+ 保存（PUT 全量替换）；加载态/保存失败可读错误；提示"保存后立即生效"。
- Consumes: Task 13 api。

- [ ] **Step 1: 写失败测试** — mock GET 两条授权渲染勾选态；取消勾选+保存断言 PUT 载荷仅含剩余项；空矩阵空状态文案。
- [ ] **Step 2: 确认失败 → 实现 → 通过 + typecheck + lint**

### Task 16: 前端——动态内容工作区

**Files:**
- Create: `lin-cms-react/src/features/content/ContentWorkspacePage.tsx`（可用类型入口）、`ContentRecordListPage.tsx`（`/content/:typeKey`）、`ContentRecordFormPage.tsx`（`/content/:typeKey/new|:recordId/edit`，含 `RecordForm` 动态表单渲染器）
- Modify: `lin-cms-react/src/routes.tsx`（section `content` 增两项，登录即可见）
- Test: `lin-cms-react/src/features/content/__tests__/RecordForm.test.tsx`、`ContentRecordList.test.tsx`

**Interfaces:**
- Produces: `RecordForm` 按 `FieldSpec[]` 映射 Input/Textarea/数字输入/Checkbox/日期/Select；列表页筛选栏（按可过滤字段生成）+ 排序 + 分页（复用既有分页组件模式）+ `scan_truncated` 提示条；无可用类型/无权限空状态引导到 Agent 接入页。
- Consumes: Task 13 api。

- [ ] **Step 1: 写失败测试** — 六种字段渲染与提交载荷；必填校验；select 枚举；列表筛选参数拼装（`f_title=...`）；`scan_truncated` 提示出现；删除确认弹层。
- [ ] **Step 2: 确认失败 → 实现 → 通过 + typecheck + lint**

### Task 17: 前端——Agent Token 管理 + 接入向导

**Files:**
- Create: `lin-cms-react/src/features/agent-tokens/AgentTokensPage.tsx`（`/profile/agent-tokens`）
- Create: `lin-cms-react/src/features/agent-access/AgentAccessPage.tsx`（`/agent-access`，登录可见）
- Modify: `lin-cms-react/src/routes.tsx`；`ProfilePage` 加入口链接
- Test: `lin-cms-react/src/features/agent-tokens/__tests__/AgentTokens.test.tsx`、`src/features/agent-access/__tests__/AgentAccess.test.tsx`

**Interfaces:**
- Produces: Token 页（新建对话框：名称/有效期天数（默认 90、≤365）/scope 按可用类型勾选 → 一次性明文展示块（复制按钮 + "关闭后不可再查看"警示，关闭即清空状态）→ 列表/吊销/过期与吊销状态徽标）；接入向导页（三步：选远程/本机 → 展示通用 MCP 配置 JSON（`command: lin-cms mcp`、`LIN_CMS_BASE_URL`、env 占位 `${LIN_CMS_AGENT_TOKEN}`，复制功能）→ 只读连通性自检说明与 CLI 安装指引链接）。
- Consumes: Task 13 api；`navigator.clipboard` 复制 helper。

- [ ] **Step 1: 写失败测试** — 新建流程提交载荷（ttl_days、scope）；明文仅在创建成功后出现一次，关闭对话框后列表接口再无明文；配置 JSON 可 `JSON.parse` 且不含真实 token（含 `${LIN_CMS_AGENT_TOKEN}` 占位）；吊销确认。
- [ ] **Step 2: 确认失败 → 实现 → 通过 + typecheck + lint**

### Task 18: 前端——审计页（Root）与路由总装

**Files:**
- Create: `lin-cms-react/src/features/admin-audit/AgentAuditPage.tsx`（`/admin/agent-audit`）
- Modify: `lin-cms-react/src/routes.tsx` 最终检查（菜单分组、守卫）
- Test: `lin-cms-react/src/features/admin-audit/__tests__/AgentAudit.test.tsx`

**Interfaces:**
- Produces: 分页表格（时间/token 前缀关联 id/用户/类型/动作/结果/错误码）+ token_id/action/时间范围过滤；非 Root 菜单不显示（守卫由路由 admin 直通规则承担）。
- Consumes: Task 13 api。

- [ ] **Step 1: 写失败测试** — mock 数据渲染行、过滤参数拼装、空状态。
- [ ] **Step 2: 确认失败 → 实现 → 通过 + `pnpm test && pnpm typecheck && pnpm lint && pnpm build`**

### Task 19: CLI 工程（独立 uv 项目）

**Files:**
- Create: `lin-cms-fastapi/cli/pyproject.toml`（项目 `lin-cms-cli`，deps `mcp==2.3.0`、`httpx`、`keyring>=25`；dev `pytest`、`pyinstaller`；自带 `uv.lock`）
- Create: `lin-cms-fastapi/cli/lin_cms_cli/{__init__,__main__,version}.py`、`cli.py`（argparse 五子命令）、`credentials.py`（keyring 服务名 `lin-cms`，账号 `agent-token`；base_url 存 `~/.config/lin-cms/config.json` 非秘密）、`client.py`（httpx 封装 + `/health`、`/api/v1/content/**`）、`mcp_bridge.py`（MCPServer stdio，6 工具转发 REST）、`redact.py`（日志脱敏：任何输出把 `lin_agent_[A-Za-z0-9_-]+` 替换为 `lin_agent_***`）
- Create: `lin-cms-fastapi/cli/build.sh`（PyInstaller onefile → `dist/lin-cms-<ver>-macos-arm64` + `sha256sum`；其他平台在 README 标记为需对应主机构建）
- Create: `lin-cms-fastapi/cli/README.md`；Test: `lin-cms-fastapi/cli/tests/{test_credentials.py,test_cli.py,test_mcp_bridge.py}`
- Modify: `lin-cms-fastapi/.gitignore` 等价物（无 git——改为 `cli/.gitignore` 备将来使用）排除 `dist/`、`.venv/`

**Interfaces:**
- Produces: `lin-cms init|test|config|mcp|logout|--version`；`init`：输 URL → GET `/health` 校验 → 输 token（stdin 隐藏回显不可行则提示粘贴）→ keyring 存储；无 keyring 后端时明确报错并列出 `LIN_CMS_AGENT_TOKEN` 环境变量 fallback，**绝不写明文文件**。`config`：stdout 或 `--out <path>` 输出通用 MCP JSON（含 `${LIN_CMS_AGENT_TOKEN}` 占位说明注释段）。`mcp`：stdio 帧——stdout 仅 MCP 协议帧，日志走 stderr 且经 redact。`test`：health+token 认证+`list_content_types` 只读探测。
- Consumes: 后端 `/health`、`/api/v1/content-types/available`、`/api/v1/content/**`。

- [ ] **Step 1: 写失败测试** — credentials：keyring 可用时存取/删除；不可用时抛 `CredentialsUnavailable`（monkeypatch backend 空模拟）；redact：样例字符串替换断言；cli：`config` 输出可 `json.loads` 且无真实 token；`mcp_bridge` 工具清单与转发载荷（mock client）。
- [ ] **Step 2: 确认失败 → 实现 → `cd cli && uv run pytest` 通过**
- [ ] **Step 3: 本机冒烟** — `uv run lin-cms --version`；对本地起的后端（8766 端口避开占用）跑 `init/test/config`；`build.sh` 产出制品并 `sha256`；跨平台矩阵写入 README「平台范围」段
- [ ] **Step 4: 端到端** — 制品 `./lin-cms-... mcp` 以 stdio 客户端脚本（`mcp` SDK Client + stdio）完成 initialize/tools/list/一次读调用

### Task 20: 文档同步与全量验证

**Files:**
- Modify: `docs/00-requirements-clarification.md`（范围增补 Agent 接入增量基线）、`docs/01-planning-proposal.md`（新表/新端点/配置项/错误码摘要）、`docs/02-implementation-plan.md`(里程碑与测试矩阵增补)、`docs/04-agent-access-technical-spec.md`（落地差异：无 pepper 决策、`AGENT_CONTENT_FILTER_SCAN_LIMIT`、`scan_truncated`、手写前端类型、MCP SDK 版本锁定）、两个工程 `README.md`
- Verify: 全部命令

- [ ] **Step 1: 更新文档**（全部简体中文；规格 §12 Pepper 行按「已选无 pepper 方案」修订）
- [ ] **Step 2: 全量验证后端** — `uv run pytest --cov=app && uvx ruff check app tests scripts && uvx ruff format --check app tests scripts`
- [ ] **Step 3: 全量验证前端** — `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
- [ ] **Step 4: E2E** — `pnpm test:e2e`（含既有四链路回归；如时间允许补 Agent 链路用例）
- [ ] **Step 5: CLI** — `cd lin-cms-fastapi/cli && uv run pytest`
- [ ] **Step 6: 完成度审计** — 对照 `docs/03` §7 验收清单与 `docs/04` §11 矩阵逐条给出证据（文件/命令输出），缺口显式列出

## 执行后变更（2026-10-20 用户指令）

Task 19 的 CLI 交付物**变更为 Go 实现**：位置从 `lin-cms-fastapi/cli/` 移至工作区根
`lin-cms-cli/`（与 lin-cms-react 平级），技术栈 Python/argparse/PyInstaller →
Go 1.27 + `modelcontextprotocol/go-sdk v1.8.0` + `zalando/go-keyring v0.2.8`。
功能契约（五命令、凭证语义、脱敏、stdio 桥、六工具、配置片段无明文）不变；
交叉编译使规格 §11.3 的全平台制品目标从「需对应主机」升级为「一次构建全覆盖」。

## 执行说明

- 用户已指定「完成实现」，执行方式为 **Native**（superpowers:executing-plans，本会话按任务顺序自实施）。
- 本计划执行时工作区无 git 仓库：不执行 commit/branch 步骤；每任务收尾 = 聚焦测试 + lint 通过。（2026-10-20 起工作区已初始化为 monorepo git 仓库。）
- Task 6 与 Task 7 的实施顺序为 **7 → 6**（依赖反转已在文中注明）。
- 端口：后端本地验证用 8766（8000/8001 被 inkocean 占用，E2E 固定 8765）。
