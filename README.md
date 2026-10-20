# Lin CMS 工作区（monorepo）

[![CI](https://github.com/sunlin92/lin-cms/actions/workflows/ci.yml/badge.svg)](https://github.com/sunlin92/lin-cms/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

本仓库是 Lin CMS 现代重建的单一 git 仓库。对外 API 契约在重建时以旧
Flask/Vue 实现为基线，冻结于 [docs/01](docs/01-planning-proposal.md) 与
`contracts/openapi.json`（旧参考实现已于 2026-10-20 移除，如需对照可从
Lin CMS 公开 GitHub 仓库重新获取）：

| 目录 | 说明 |
| --- | --- |
| `lin-cms-fastapi/` | **新后端**：FastAPI + SQLAlchemy，SQLite 默认、零外部中间件 |
| `lin-cms-react/` | **新前端**：React 19 + TS + Tailwind + shadcn/Watermelon UI |
| `lin-cms-cli/` | 本机 CLI（Go）：Agent Token 安全存储、连通性测试、stdio MCP 桥、多平台单文件分发 |
| `docs/` | 需求澄清、规划计划书（含 API 契约）、实现实施方案、Agent 接入需求/规格/实施计划（03-05） |
| `contracts/` | 后端导出的 OpenAPI 契约（[再生成方式](contracts/README.md)） |
| `Makefile` | monorepo 统一工程入口：`make help` 查看后端/前端/CLI 全部目标 |

## 快速启动

```bash
# 后端（默认 root/123456）
cd lin-cms-fastapi && cp .env.example .env  # 填 LIN_SECRET_KEY
uv sync && uv run uvicorn app.main:app --reload --port 8000

# 前端
cd lin-cms-react && pnpm install && pnpm dev   # http://localhost:5173
```

## 工程命令（Makefile 统一入口）

```bash
make help                 # 查看全部目标
make test-all             # 后端 pytest + 前端 vitest + CLI go test
make check-all            # 三工程静态检查（ruff / tsc + biome / go vet + gofmt）
make backend-openapi      # 改接口后重新导出 contracts/openapi.json
make frontend-e2e         # Playwright（自动编排后端 8765 + preview 4173）
make cli-build            # CLI 交叉编译五平台单文件制品
```

单工程命令详见各自 `README.md`；工具与端口注意事项见 `AGENTS.md`。

详细设计见 [docs/00-requirements-clarification.md](docs/00-requirements-clarification.md)、[docs/01-planning-proposal.md](docs/01-planning-proposal.md)、[docs/02-implementation-plan.md](docs/02-implementation-plan.md)；Agent 接入（可配置内容模型 + Agent Token + `/mcp` + CLI）见 [docs/03](docs/03-agent-access-requirements.md)、[docs/04](docs/04-agent-access-technical-spec.md)、[docs/05](docs/05-agent-access-implementation-plan.md)。

## 参与贡献

欢迎贡献。开发流程、约定与提交规范见 [CONTRIBUTING.md](CONTRIBUTING.md)；社区行为准则见 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)；安全问题按 [SECURITY.md](SECURITY.md) 的私密渠道报告，不要开公开 Issue；显著变更记录见 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

[MIT](LICENSE)
