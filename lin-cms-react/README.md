# lin-cms-react

Lin CMS 现代重建的前端：React 19 + TypeScript(strict) + Vite + Tailwind CSS 4 + shadcn 风格组件 + React Router + TanStack Query + Zustand + React Hook Form/Zod + sonner。

## 功能

- 登录（支持后端验证码开关：开启时显示图形验证码并携带 `tag` 头）
- 仪表盘（统计卡 + 最近日志 + 快捷入口，非管理员优雅降级）、关于页
- 日志：关键字/人员/时间范围筛选、关键字高亮（纯文本分段，无 HTML 注入）、加载更多
- 图书：列表/新建/编辑/删除（删除按钮按「删除图书」权限显隐）
- 管理员：用户列表（分组过滤、编辑、重置密码、删除）、创建用户
- 分组：列表/新建/权限树（模块全选半选）/权限差异保存（dispatch + remove）
- 个人中心：改昵称邮箱、改密码（改密后强制重新登录）、头像上传
- 布局：可折叠侧栏（移动端抽屉）、面包屑、主题（4 套中国风预设 + 深色）、权限驱动菜单与路由守卫

## 快速开始

```bash
pnpm install
pnpm dev        # http://localhost:5173，请求 VITE_API_BASE_URL（默认 http://127.0.0.1:8000）
```

先启动后端（`../lin-cms-fastapi`），默认账号 `root / 123456`。

## 命令

| 命令                           | 说明                                                                        |
| ------------------------------ | --------------------------------------------------------------------------- |
| `pnpm dev`                     | 开发服务器                                                                  |
| `pnpm build`                   | 生产构建（读 `.env.production` 的 `VITE_API_BASE_URL`）                     |
| `pnpm test`                    | Vitest 单元/组件测试（60 用例；e2e 目录已排除）                             |
| `pnpm test:e2e`                | Playwright E2E（4 条主流程；自动拉起后端 8765 + preview 4173，独立 SQLite） |
| `pnpm typecheck` / `pnpm lint` | tsc -b / Biome（`lint:fix` 自动修复格式与 import 排序）                     |

E2E 说明：端口 8000/8001 可能被其他项目占用，E2E 固定使用 8765（`.env.e2e` + `--mode e2e` 构建）；首跑需 `pnpm exec playwright install chromium`。

## 结构

```
src/
├── routes.tsx          # 路由 + 侧栏菜单单一来源；Auth/Permission 守卫
├── components/ui/      # shadcn 风格基础组件（17 个）
├── components/         # DataTable/Pagination/ConfirmDialog/PageHeader/EmptyState/Can + 布局
├── lib/api/            # client.ts（fetch 封装：信封判定、ApiError、单飞刷新重放、登出跳转）+ types.ts
├── lib/                # tokens/permissions/format/utils
├── stores/             # zustand persist：auth / theme
└── features/           # auth/dashboard/about/logs/books/users/groups/profile/errors
```

约定：单文件 ≤ 800 行、单函数 ≤ 100 行；TypeScript strict 禁 any；样式只用设计 token（禁硬编码色值）。

## Agent 接入（2026-10 增量）

新增业务域：`content-types`（类型向导）、`content`（动态内容工作区：按 schema 渲染
表单/过滤/排序）、`agent-tokens`（Token 一次性展示与吊销）、`agent-access`（三步接入
向导与通用 MCP 配置）、`admin-audit`（Root 审计）；分组页新增「内容权限」入口。
API 封装统一走 `src/lib/api/agent.ts`（信封/DTO 双形态经 client 解析）。
