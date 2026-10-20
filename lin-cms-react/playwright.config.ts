import { defineConfig } from '@playwright/test'

/**
 * E2E：同时拉起 FastAPI 后端（SQLite 独立 e2e 库，端口 8765）与前端 preview（4173）。
 * dist 以 --mode e2e 构建，内置 VITE_API_BASE_URL=http://127.0.0.1:8765。
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
  },
  webServer: [
    {
      command:
        'cd ../lin-cms-fastapi && rm -f data/e2e.db && LIN_ENV=development LIN_SECRET_KEY=e2e-secret-key LIN_DATABASE_URL=sqlite:///./data/e2e.db LIN_CORS_ORIGINS=http://localhost:4173 LIN_RATE_LIMIT_ENABLED=false uv run uvicorn app.main:app --port 8765',
      url: 'http://127.0.0.1:8765/health',
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: 'pnpm build:e2e && pnpm preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
})
