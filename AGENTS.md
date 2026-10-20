# Lin CMS 重建工作区智能体说明

本仓库是 Lin CMS 的前后端分离重建 monorepo（工作区根目录即唯一 git
仓库）：用 FastAPI、React 与 Go CLI 重建可独立部署的工程。对外契约在
重建时以旧 Flask/Vue 实现为基线冻结于 `docs/01-planning-proposal.md` 与
`contracts/openapi.json`（旧参考仓库已于 2026-10-20 移除）。规划文档是
产品与契约的事实来源；修改实现前先阅读对应文档，不得根据单个模块自行
推导新的契约。

## 开始前必读

- 需求澄清（任务边界、零外部中间件决策）：`docs/00-requirements-clarification.md`
- 规划计划书（架构、API 契约、数据模型、错误码）：`docs/01-planning-proposal.md`
- 实现实施方案（WBS、契约优先工作流、测试矩阵）：`docs/02-implementation-plan.md`
- 冻结的接口契约：`contracts/openapi.json`
- 工作区总览：`README.md`；三个新工程各自的 `README.md`

## 工作契约

- 变更范围必须与用户请求一致。核心边界是**零外部中间件**：不引入
  Redis、消息队列、Celery、外部缓存或搜索服务等任何需要独立部署的
  组件；SQLite 为默认数据库（标准库），ORM 层保持可切换
  PostgreSQL/MySQL；成熟第三方库正常使用。默认单机单进程部署，
  Docker Compose 仅为可选交付物。
- 对外 API 契约必须与冻结的旧 Lin CMS（Flask）契约保持兼容：信封响应
  `{message, code, request}`、`code < 9998` 视为成功、0-based 分页
  （`count` 取值 1..15、默认 5）、24 条权限名称与模块同名同模、Root
  按 `level = ROOT` 判定。调整契约必须先更新文档与
  `contracts/openapi.json`，再动实现。
- 所有新代码进入本 monorepo 的 `lin-cms-fastapi/`、`lin-cms-react/` 或
  `lin-cms-cli/`；旧 Flask/Vue 参考仓库已移除，如需逐行对照旧行为，从
  Lin CMS 公开 GitHub 仓库重新获取，或以 `docs/01` 冻结契约为准。
- 引入或升级依赖前，先核对锁定版本的官方文档，不得凭记忆或过时示例
  编码。后端依赖以 `lin-cms-fastapi/pyproject.toml` + `uv.lock` 为准，
  前端以 `lin-cms-react/package.json` + `pnpm-lock.yaml` 为准。
- 认证、授权、文件上传、限流与令牌黑名单属于安全敏感面；修改前先
  读 `docs/01-planning-proposal.md` 对应章节，并保持测试覆盖。
- 新行为和缺陷修复使用测试驱动开发：先新增或更新能捕获契约的最小
  测试，再运行聚焦检查，最后实施和重构。
- 不得提交密钥或生成产物。`.env`、`data/*.db`、`dist/`、
  `node_modules/`、`assets/` 运行时产物均不进入交付（根与各工程
  `.gitignore` 已覆盖）；不得直接修改 `dist/`、`node_modules/` 内的
  文件。
- 声明完成前必须验证，明确报告已运行命令和验证缺口。

## 文档与能力路由

先找到拥有该决策的文档；实现揭示矛盾时，同步修正文档，不得静默择一：

- 任务边界、功能范围、技术选型理由：`docs/00-requirements-clarification.md`
- 架构分层、API 契约、数据模型、鉴权与权限模型、错误码、配置项：
  `docs/01-planning-proposal.md`
- 里程碑、工作分解、契约优先工作流、测试计划：
  `docs/02-implementation-plan.md`
- 接口路径、请求/响应模式：`contracts/openapi.json`（由
  `lin-cms-fastapi/scripts/export_openapi.py` 导出或 `make backend-openapi`，
  改接口后须重新导出；目录说明见 `contracts/README.md`）
- 旧实现的具体行为疑问：以 `docs/01-planning-proposal.md` 的冻结契约
  为准；如需逐行对照，从 Lin CMS 公开 GitHub 仓库（lin-cms-flask /
  lin-cms-vue）重新 clone

## 项目结构与模块组织

- `lin-cms-fastapi/`：Python 3.12 + FastAPI + SQLAlchemy 2（同步）+
  Alembic。分层为 `app/api/routers/`（路由，按域：auth、user、
  admin_users、admin_groups、content、health）→ `app/services/`
  （业务）→ `app/repositories/`（数据访问）→ `app/models/`（ORM）；
  `app/schemas/` 为 Pydantic 契约，`app/core/` 为配置、错误、日志、
  权限、限流、安全等横切件，`app/db/` 与 `alembic/` 管理会话与迁移，
  `scripts/export_openapi.py` 导出契约。
- `lin-cms-cli/`：Lin CMS 本机 CLI（Go 1.27）。五命令 `init/test/config/mcp/logout`；
  `internal/` 分包（redact 脱敏、credentials 凭证、cmsclient REST、mcpbridge stdio 桥）；
  依赖官方 `modelcontextprotocol/go-sdk`（MCP stdio 服务器）与 `zalando/go-keyring`
  （系统凭证库）；凭证绝不写明文文件，stdout 仅 MCP 帧、诊断走 stderr 且脱敏。
- `lin-cms-react/`：React 19 + TypeScript strict + Vite + Tailwind 4。
  `src/features/` 按业务域组织（auth、users、groups、books、logs、
  dashboard、profile、about、errors、placeholder）；`src/components/`
  存放跨域通用件，其中 `ui/` 与 `wm/` 是 shadcn 风格组件（Watermelon
  UI 以注册表复制方式引入，**不是 npm 依赖，直接修改本地副本**）；
  `src/lib/api/` 封装 HTTP 客户端与信封解析，`src/lib/auth/`、
  `src/lib/permissions.ts` 处理会话与权限判定，`src/stores/` 为
  Zustand（auth、theme），`tests/e2e/` 为 Playwright 用例。
- `docs/` 与 `contracts/` 属于工作区级资产，与两个工程同步演进。

## 构建、测试与开发命令

统一入口为根 `Makefile`（`make help` 列出全部目标：`test-all` / `check-all` /
`backend-openapi` / `frontend-e2e` / `cli-build` 等）；以下为各工程内的等价原始命令。

后端（`lin-cms-fastapi/`，包管理用 uv）：

```bash
cp .env.example .env            # 必填 LIN_SECRET_KEY；root 初始密码见 LIN_BOOTSTRAP_ADMIN_PASSWORD
uv sync                         # 安装依赖
uv run uvicorn app.main:app --reload --port 8000
uv run pytest                   # 全部后端测试
uv run pytest --cov=app         # 覆盖率
uvx ruff check app tests scripts && uvx ruff format --check app tests scripts
uv run python scripts/export_openapi.py   # 改接口后更新 contracts/openapi.json
```

CLI（`lin-cms-cli/`，Go）：

```bash
go test ./...                  # 单元测试
go vet ./... && gofmt -l .     # 静态检查与格式
./build.sh                     # 交叉编译五平台单文件制品 + sha256（输出 dist/）
```

前端（`lin-cms-react/`，包管理用 pnpm）：

```bash
pnpm install
pnpm dev                        # http://localhost:5173
pnpm test                       # vitest 单元测试
pnpm typecheck                  # tsc -b
pnpm lint && pnpm lint:fix      # biome
pnpm build                      # 类型检查 + 生产构建
pnpm test:e2e                   # Playwright（自动拉起后端 8765 与 preview 4173）
```

## 端口与环境注意事项（本机实测）

- 本机 8000/8001 端口常被用户另一项目（inkocean）长期占用。启动后端
  前先 `lsof -i :PORT` 检查；被占用时换端口，**绝不能杀掉用户自己的
  进程**。
- Playwright E2E 固定使用后端 8765（独立 `data/e2e.db`）+ 前端
  preview 4173，由 `playwright.config.ts` 自动编排，`dist` 以
  `--mode e2e` 构建（`.env.e2e` 内置 `VITE_API_BASE_URL`）。
- Playwright 浏览器缓存在 `~/Library/Caches/ms-playwright`；中断的
  安装会残留 `__dirlock` 锁导致后续 install 失败，删除锁文件后重装。

## 编码风格与命名

- 硬性行数约束：单个源文件 ≤ 800 行，单个函数 ≤ 100 行。
- 后端：Python 3.12，ruff（line-length 120，规则 E/F/I/UP/B；B008
  对 `Depends()/Query()/Header()/File()` 豁免）。函数与模块用
  `snake_case`，Pydantic 模型用 `PascalCase`。配置项统一 `LIN_`
  前缀（pydantic-settings）。
- 前端：TypeScript strict 零错误，Biome 检查通过。React 组件
  `PascalCase`，钩子与工具 `camelCase`。样式走 Tailwind 4 与既有
  shadcn/Watermelon 组件，不另起 UI 框架。
- 架构分层保持单向依赖：路由 → 服务 → 仓储；前端 feature 之间不互相
  import，跨域逻辑下沉到 `lib/` 或 `components/`。

## 已知实现约定（防回归）

以下约定是踩坑后固化下来的，改动相关代码时必须保持并让测试继续通过：

- FastAPI 依赖中未注解的参数会被解析为查询参数：写依赖函数时必须
  显式标注 `request: Request`（如限流器工厂）。
- `await request.form()` 返回 starlette 原生 `UploadFile`；
  `isinstance` 判断必须用 `starlette.datastructures.UploadFile`，
  不是 `fastapi.UploadFile`。
- Pydantic 模型做查询参数集必须 `Annotated[Model, Query()]`，不能用
  `= Depends()`（会在依赖内抛裸 ValidationError 变 500）。
- pydantic-settings 列表字段（如 `LIN_CORS_ORIGINS`）需
  `Annotated[list[str], NoDecode]` + `field_validator(mode="before")`
  同时兼容 JSON 与逗号分隔两种写法。
- 同一路由的 GET/POST 不共用一个处理函数（避免重复 operation id）。
- 密码哈希用 Argon2id，同时保留对旧 Werkzeug scrypt 哈希
  （`scrypt:N:r:P$b64salt$hex`，`hashlib.scrypt` dklen=64）的校验
  兼容，保证旧库用户可登录。
- 文件上传契约：本地存储按 `YYYY/MM/DD` 分目录、MD5 去重，默认
  2 MB/文件、20 MB/请求、最多 10 个文件、仅 jpg/jpeg/png。
- 会话：JWT access 1 小时 / refresh 7 天；`token_version` 支持全量
  失效；登出走数据库令牌黑名单。

## 测试约定

- 后端测试位于 `lin-cms-fastapi/tests/`（pytest + httpx），按域命名
  （`test_auth.py`、`test_admin_users.py`、`test_books.py` 等），
  覆盖契约、权限、会话撤销、限流、文件与回归项；新功能与缺陷修复
  必须带测试。
- 前端单元测试与源码相邻（`*.test.ts(x)`、vitest + Testing
  Library）；E2E 位于 `tests/e2e/`，覆盖登录退出、图书增删、用户
  增删、日志页四条主链路，新增核心页面时补充对应 E2E。
- 除非行为有意改变且归属文档说明原因，不得删除或弱化既有测试。

## 提交与交付约定

- 工作区根目录自 2026-10-20 起是唯一 git 仓库（monorepo：三个工程 +
  `docs/` + `contracts/` 同库管理，不使用 submodule，各工程不再单独
  init）。提交信息使用简短祈使句并可带范围，例如
  `backend: 加固令牌黑名单`、`frontend: 修复分页参数`、`cli: 补构建脚本`。
- 交付说明应包含：变更摘要、已运行的验证命令（pytest / vitest /
  typecheck / lint / build / E2E）及验证缺口。

## 安全与配置提示

- `LIN_SECRET_KEY` 必须由 `.env` 提供，不得写入代码或文档示例；
  `.env` 不入库。生产部署必须修改 `LIN_BOOTSTRAP_ADMIN_PASSWORD`。
- 修改 CORS 来源、上传限制、限流参数、令牌有效期等安全相关默认值
  时，须同步更新 `docs/01-planning-proposal.md` 并补充测试。
- 前端所有接口调用必须经 `src/lib/api/` 封装，统一处理信封解析与
  401 跳转，不得在组件里裸用 fetch。
