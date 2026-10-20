# Lin CMS monorepo 统一工程入口。
# 各目标的命令与三个工程 README / AGENTS.md 保持逐字一致；make help 查看全部。
.DEFAULT_GOAL := help
.PHONY: help

help: ## 列出全部目标
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ------------------------------- 后端 lin-cms-fastapi -------------------------------

.PHONY: backend-sync backend-run backend-test backend-cov backend-lint backend-openapi backend-audit-cleanup
backend-sync: ## 后端安装依赖（uv sync）
	cd lin-cms-fastapi && uv sync
backend-run: ## 启动后端开发服务（端口 8000；本机被占用时自行换端口）
	cd lin-cms-fastapi && uv run uvicorn app.main:app --reload --port 8000
backend-test: ## 后端全量测试（pytest）
	cd lin-cms-fastapi && uv run pytest
backend-cov: ## 后端测试 + 覆盖率
	cd lin-cms-fastapi && uv run pytest --cov=app
backend-lint: ## 后端静态检查（ruff check + format --check）
	cd lin-cms-fastapi && uvx ruff check app tests scripts && uvx ruff format --check app tests scripts
backend-openapi: ## 重新导出 contracts/openapi.json（改接口后必须执行）
	cd lin-cms-fastapi && uv run python scripts/export_openapi.py
backend-audit-cleanup: ## 清理过期 Agent 审计（维护命令）
	cd lin-cms-fastapi && uv run python scripts/cleanup_agent_audit.py

# ------------------------------- 前端 lin-cms-react -------------------------------

.PHONY: frontend-install frontend-dev frontend-test frontend-typecheck frontend-lint frontend-build frontend-e2e
frontend-install: ## 前端安装依赖（pnpm install）
	cd lin-cms-react && pnpm install
frontend-dev: ## 启动前端开发服务（http://localhost:5173）
	cd lin-cms-react && pnpm dev
frontend-test: ## 前端单元测试（vitest）
	cd lin-cms-react && pnpm test
frontend-typecheck: ## 前端类型检查（tsc -b）
	cd lin-cms-react && pnpm typecheck
frontend-lint: ## 前端 Biome 检查
	cd lin-cms-react && pnpm lint
frontend-build: ## 前端类型检查 + 生产构建
	cd lin-cms-react && pnpm build
frontend-e2e: ## Playwright E2E（自动编排后端 8765 + 前端 preview 4173）
	cd lin-cms-react && pnpm test:e2e

# ------------------------------- CLI lin-cms-cli -------------------------------

.PHONY: cli-test cli-lint cli-build
cli-test: ## CLI 单元测试（go test）
	cd lin-cms-cli && go test ./...
cli-lint: ## CLI 静态检查（go vet + gofmt）
	cd lin-cms-cli && go vet ./... && test -z "$$(gofmt -l .)"
cli-build: ## CLI 交叉编译五平台单文件制品（输出 lin-cms-cli/dist/）
	cd lin-cms-cli && ./build.sh

# ------------------------------- 聚合 -------------------------------

.PHONY: test-all check-all
test-all: backend-test frontend-test cli-test ## 三工程全部测试
check-all: backend-lint frontend-typecheck frontend-lint cli-lint ## 三工程全部静态检查
