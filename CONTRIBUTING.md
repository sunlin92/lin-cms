# 贡献指南

感谢你考虑为 Lin CMS 重建项目贡献。这是一个三工程 monorepo（FastAPI 后端 / React 前端 / Go CLI），动手前建议先花几分钟了解项目的基本决策。

## 开始之前

先读这三份文档，了解项目边界与契约：

- [docs/00-requirements-clarification.md](docs/00-requirements-clarification.md) — 任务边界与零外部中间件决策
- [docs/01-planning-proposal.md](docs/01-planning-proposal.md) — 架构、API 契约、数据模型、错误码
- [docs/02-implementation-plan.md](docs/02-implementation-plan.md) — 里程碑、工作分解与测试计划

两条硬边界：

1. **零外部中间件**：不引入 Redis、消息队列、Celery、外部缓存或搜索服务等需要独立部署的组件；SQLite 为默认数据库，ORM 层保持可切换 PostgreSQL/MySQL。
2. **契约兼容**：对外 API 与冻结的旧 Lin CMS（Flask）契约保持兼容。调整接口的流程是：先更新 `docs/01-planning-proposal.md`，再更新 `contracts/openapi.json`，最后动实现。

## 环境要求

| 工具 | 版本 | 用于 |
| --- | --- | --- |
| Python | 3.12+ | 后端（配合 [uv](https://docs.astral.sh/uv/)） |
| Node.js | LTS | 前端（配合 pnpm） |
| Go | 1.25+ | CLI |
| Make | — | 根目录统一工程入口 |

## 本地开发

```bash
git clone https://github.com/sunlin92/lin-cms.git
cd lin-cms

# 后端（默认 root/123456）
cd lin-cms-fastapi && cp .env.example .env   # 填入 LIN_SECRET_KEY
uv sync && uv run uvicorn app.main:app --reload --port 8000

# 前端（另开终端）
cd lin-cms-react && pnpm install && pnpm dev  # http://localhost:5173

# CLI
cd lin-cms-cli && go test ./...
```

日常验证走根 Makefile，单工程命令见各自 `README.md`：

```bash
make help        # 列出全部目标
make test-all    # 后端 pytest + 前端 vitest + CLI go test
make check-all   # 三工程静态检查
```

## 开发约定

- **测试先行**：新功能和缺陷修复先写能捕获契约的最小测试，再实现代码。提交前 `make test-all` 与 `make check-all` 必须通过。
- **契约同步**：改了接口，运行 `make backend-openapi` 重新导出 `contracts/openapi.json` 并一并提交。CI 有契约漂移门禁，会拦截遗漏的导出。
- **代码规模**：单个源文件 ≤ 800 行，单个函数 ≤ 100 行。
- **分层依赖**：后端路由 → 服务 → 仓储保持单向；前端 feature 之间不互相 import，跨域逻辑下沉到 `lib/` 或 `components/`。
- **不提交生成物**：`.env`、`data/*.db`、`dist/`、`node_modules/`、`assets/` 均不进入版本库。
- **安全敏感面**：认证、授权、文件上传、限流、令牌黑名单相关的改动，先读 `docs/01-planning-proposal.md` 对应章节，并保持测试覆盖。

## 提交与 PR

- 提交信息用简短祈使句，可带范围：`backend: 加固令牌黑名单`、`frontend: 修复分页参数`、`cli: 补构建脚本`、`docs: 更新部署说明`。
- 从 `main` 切出特性分支，PR 描述参照模板勾选自检清单。
- 合并前确认：测试与静态检查通过、接口改动已重新导出契约、相关文档同步更新。

## 报告问题

Bug 与功能建议请用 Issue 模板创建，写清影响的工程（后端 / 前端 / CLI）与复现步骤。安全问题不要开公开 Issue，走 [SECURITY.md](SECURITY.md) 的私密渠道。参与社区互动遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
