# Lin CMS 重构：实现实施方案

> 文档版本：v0.1（待评审）  
> 日期：2026-10-19  
> 版本核验日期：2026-10-19  
> 依据：[需求澄清](./00-requirements-clarification.md)、[规划计划书](./01-planning-proposal.md)  
> 本文是可执行的实施计划。三份文档确认后开始编码。

## 1. 实施原则

1. **契约先行**：先录制旧接口行为，再写新后端；每个接口先有契约测试，再有实现。
2. **小步交付**：每个任务可独立合并、独立回滚；单个 PR 控制在 400 行以内（生成代码除外）。
3. **测试随行**：功能代码与测试同 PR；不允许“先实现、后补测试”。
4. **前端并行**：M0 完成后，后端 M1–M3 与前端 M4–M5 可并行推进，以 OpenAPI 契约解耦。
5. **单一仓库**：所有新代码进入本 monorepo 的 `lin-cms-fastapi/`、`lin-cms-react/` 与 `lin-cms-cli/`（承担规划稿 `apps/` 的角色）；旧 Flask/Vue 参考仓库已移除。
6. **默认安全**：密钥无默认值、CORS 白名单、上传白名单、日志脱敏、Root 判定按级别。

## 2. 里程碑与工期

| 里程碑 | 内容 | 工期（人日） | 前置 | 出口标准 |
| --- | --- | --- | --- | --- |
| M0 | 契约冻结与工程脚手架 | 3 | — | 旧接口行为快照可回放；版本锁定且 CI 空跑通过 |
| M1 | 后端核心与认证 | 4 | M0 | 登录/刷新/登出/改密/限流测试通过；验证码（启用时）测试通过 |
| M2 | 后端 RBAC 与用户/分组 | 5 | M1 | 24 条权限同步；用户/分组/权限接口测试通过 |
| M3 | 日志、图书、文件、健康检查 | 4 | M1 | 32 个接口全部实现；契约测试通过 |
| M4 | 前端底座与设计系统 | 5 | M0 | 布局壳、主题、API 客户端、权限组件可用 |
| M5 | 前端业务页面与联调 | 8 | M3、M4 | 13 个业务页面 + 404 可用；E2E 主流程通过 |
| M6 | 加固、部署与交付 | 4 | M5 | 安全/性能/容器/文档全部达标 |

总计约 **33 人日**：

- 单人串行：约 6–7 周。
- 双人并行（1 后端 + 1 前端）：约 4–5 周。
- M1–M3 与 M4–M5 在 M0 完成后可并行，不互为阻塞。

## 3. 工作分解结构（WBS）

### M0：契约冻结与工程脚手架（3 人日）

| ID | 任务 | 产出 | 依赖 | 验收 |
| --- | --- | --- | --- | --- |
| T0.1 | 初始化 monorepo | 根 `README.md`、`Makefile`、`.editorconfig`、`.gitignore`、`lin-cms-fastapi/`、`lin-cms-react/`、`contracts/`、`docs/`（`infra/` 未设立；`lin-cms-cli/` 与根 Makefile 于 2026-10-20 增补） | — | 目录结构与规划书一致；精确版本已锁定 |
| T0.2 | 录制旧接口行为 | `scripts/capture_contract.py`、`contracts/fixtures/*.json` | 旧 Flask 工程可安装运行 | 覆盖 32 个接口的成功与主要失败场景 |
| T0.3 | 契约测试骨架 | `lin-cms-fastapi/tests/contract/` 与 fixture 加载器 | T0.2 | 新后端未实现时测试红，实现后转绿 |
| T0.4 | 后端脚手架 | Python 3.15.0、FastAPI 0.148.0、Pydantic 2.14.1、SQLAlchemy 2.1.5、Alembic 1.20.0、PyJWT 2.15.1、argon2-cffi 25.1.0、structlog 26.1.0、Ruff 0.17.1、pytest 9.1.1；`pyproject.toml`、`app/main.py` 最小应用 | T0.1 | `uv sync --frozen && uv run pytest` 可执行 |
| T0.5 | 前端脚手架 | Node 24.22.0 LTS、pnpm 12.14.0、React 19.3.1、TypeScript 7.0.2、Vite 8.3.4、Tailwind 4.3.3、shadcn 4.22.1、TanStack Query 5.104.4、TanStack Table 9.3.1、Zustand 5.0.15、RHF 7.90.0、Zod 4.6.7、openapi-fetch 0.17.0、MSW 3.0.3、Vitest 5.0.5、Biome 2.5.15 | T0.1 | `pnpm install --frozen-lockfile && pnpm dev` 可启动 |
| T0.6 | CI 骨架 | `.github/workflows/ci.yml`：lint、test、build 三个 job，使用 frozen lockfile | T0.4、T0.5 | 空实现下 CI 通过；无依赖漂移 |
| T0.7 | 开发环境 | `.env.example`、`data/` 目录、可选 `lin-cms-fastapi/infra/docker-compose.yml`（仅 api + web） | T0.1 | 无外部服务即可启动；SQLite 文件自动创建 |
| T0.8 | 最新正式版兼容性冒烟 | 后端最小 API + 前端最小页面；验证 FastAPI/SQLAlchemy 与 React 19.3/Vite 8/TS 7/Tailwind 4.3/shadcn 4.22、TanStack Query/Table、Zustand、RHF/Zod、openapi-fetch、MSW 可构建 | T0.4、T0.5 | 两端 lint/test/build 通过；不兼容项记录 ADR 并回退到最新可用稳定版 |

### M1：后端核心与认证（4 人日）

| ID | 任务 | 产出 | 依赖 | 验收 |
| --- | --- | --- | --- | --- |
| T1.1 | 配置系统 | `core/config.py`，读取 `LIN_*` 环境变量 | T0.4 | 缺失 `SECRET_KEY` 启动失败；测试可覆盖 |
| T1.2 | 数据库与模型 | `db/session.py`、10 张表模型、UTC 时间处理、SQLite WAL/busy_timeout/foreign_keys | T1.1 | 模型关系正确；软删除过滤可用；SQLite 参数生效 |
| T1.3 | 初始迁移与种子 | Alembic 初始迁移；Root/Guest/root 用户/权限种子 | T1.2 | 空库 `alembic upgrade head` 后可登录；生产必须通过 `LIN_BOOTSTRAP_ADMIN_PASSWORD` 提供初始密码 |
| T1.4 | 错误体系 | `core/errors.py`：业务异常、响应信封、校验错误映射 | T1.1 | 422 → 400/10030；404/401/429 符合契约 |
| T1.5 | 安全工具 | JWT 签发/校验、Argon2id、旧 scrypt 兼容与登录后升级、token_version | T1.4 | 单元测试覆盖过期/损坏/类型混用 |
| T1.6 | 认证接口 | 登录、刷新、登出、个人信息、改密、验证码（开启时用 Pillow 可选依赖） | T1.5 | 旧 `test_auth.py`、`test_session_revocation.py` 迁移通过 |
| T1.7 | 黑名单 | `lin_token_blocklist` 写入/查询/清理（仅数据库） | T1.5 | 登出后 access/refresh 均失效 |
| T1.8 | 限流 | 进程内 IP 维度计数器 + 过期清理 | T1.1 | 超过阈值返回 429/10140；单进程假设写入文档 |
| T1.9 | 认证测试 | 登录成功/失败、刷新、登出、改密、限流、验证码 | T1.6–T1.8 | 覆盖率 ≥ 90% |

### M2：后端 RBAC 与用户/分组（5 人日）

| ID | 任务 | 产出 | 依赖 | 验收 |
| --- | --- | --- | --- | --- |
| T2.1 | 权限元信息注册表 | `core/permissions.py`、装饰器/依赖、启动同步 | T1.2 | 24 条权限与旧实现同名同模块 |
| T2.2 | 授权依赖 | `require_login`、`require_root`、`require_permission` | T2.1 | Root 旁路；无分组拒绝；无权限 401 |
| T2.3 | 用户管理接口 | 分页、分组过滤、创建、更新、重置密码、删除 | T2.2 | Root 用户不可删；邮箱重复 400 |
| T2.4 | 分组接口 | 列表、详情、创建、更新、删除 | T2.2 | 内置组/有用户组不可删 |
| T2.5 | 权限分配接口 | 批量分配、批量回收、幂等 | T2.2 | 分配后立即生效，回收后立即失权 |
| T2.6 | 用户信息接口 | `/cms/user` 更新、`/cms/user/permissions` | T2.2 | 权限嵌套结构稳定 |
| T2.7 | RBAC 测试 | 权限矩阵、越权、内置组保护、权限同步幂等 | T2.3–T2.6 | 旧 `test_admin.py`、`test_user.py`、`test_permission_sync.py` 迁移通过 |

### M3：日志、图书、文件、健康检查（4 人日）

| ID | 任务 | 产出 | 依赖 | 验收 |
| --- | --- | --- | --- | --- |
| T3.1 | 行为日志 | `lin_log` 写入、模板渲染、登录日志 | T2.2 | 登录/删用户/分组增删有记录 |
| T3.2 | 日志查询 | 分页、用户/时间过滤、关键字转义、时间戳字段 | T3.1 | 旧 `test_log.py`、加固用例通过 |
| T3.3 | 图书 CRUD | 公开查询/搜索、登录增改、权限删除、软删除 | T2.2 | 旧 `test_book.py` 迁移通过 |
| T3.4 | 文件上传 | 校验、MD5 去重、日期目录、静态挂载、URL 生成 | T1.1 | 合法/超限/非法扩展名用例通过 |
| T3.5 | 健康检查与文档 | `/health`、OpenAPI 导出、生产关闭文档 | T1.1 | `/health` 返回 ok；`/openapi.json` 可导出 |
| T3.6 | 访问日志 | 请求 ID、耗时、脱敏、结构化输出 | T1.1 | 密码/token 不出现在日志 |
| T3.7 | 综合测试 | 32 接口契约测试全绿 | T3.2–T3.6 | 契约 fixture 全部匹配 |

### M4：前端底座与设计系统（5 人日）

| ID | 任务 | 产出 | 依赖 | 验收 |
| --- | --- | --- | --- | --- |
| T4.1 | 工程配置 | Vite、TS strict、Biome、路径别名 | T0.5 | `pnpm lint && pnpm typecheck && pnpm build` 通过 |
| T4.2 | 样式底座 | Tailwind CSS 4、CSS token、深色模式 | T4.1 | token 可切换；无硬编码颜色 |
| T4.3 | shadcn + Watermelon | shadcn CLI 4.22.1、`components.json`、注册表配置、后台壳与基础组件 | T4.2 | `agndex-dashboard` 可用；组件源码在仓库内 |
| T4.4 | API 客户端 | `schema.d.ts` 生成（openapi-typescript 7.13.0）、openapi-fetch 0.17.0 客户端、错误模型 | T3.5 | 类型检查通过；可调用 `/health` |
| T4.5 | 认证状态 | Zustand 5.0.15 auth store、token 存储、刷新单飞、登出清理 | T4.4 | 刷新并发只发一次请求 |
| T4.6 | 布局壳 | 侧边栏、顶栏、面包屑、多页签、侧边栏搜索、命令面板、移动端抽屉 | T4.3 | 桌面/移动端可用；页签可恢复 |
| T4.7 | 通用组件 | TanStack Table 9.3.1 DataTable、RHF 7.90.0 + Zod 4.6.7 FormField、ConfirmDialog、EmptyState、PageHeader、Can | T4.3 | Story/测试覆盖主要状态 |
| T4.8 | 权限与路由 | 路由清单、守卫、`usePermission`、菜单过滤 | T4.5、T4.7 | 无权限不可见/不可进 |
| T4.9 | 前端测试底座 | MSW 3.0.3、Testing Library、QueryClient 测试工具 | T4.4 | 示例测试通过 |

### M5：前端业务页面与联调（8 人日）

| ID | 任务 | 产出 | 依赖 | 验收 |
| --- | --- | --- | --- | --- |
| T5.1 | 登录页 | 表单、验证码开关、错误提示、登录后跳转 | T4.5 | 登录/失败/验证码流程可用 |
| T5.2 | 工作台 | 统计卡片、Recharts 3.10.1 趋势图、快捷入口、最近日志 | T4.6、T3.2 | 数据来自现有接口；无新后端契约 |
| T5.3 | 关于页 | 项目/技术栈/版本信息 | T4.6 | 页面可访问 |
| T5.4 | 用户列表 | 分页、分组筛选、编辑弹窗、重置密码、删除 | T4.7、T2.3 | 与旧交互一致；分页 1-based ↔ 0-based 正确 |
| T5.5 | 新建用户 | 表单校验、分组多选 | T4.7、T2.3 | 创建后列表刷新 |
| T5.6 | 分组列表 | 列表、编辑信息、删除确认 | T4.7、T2.4 | 内置组删除按钮禁用/报错可读 |
| T5.7 | 新建分组 | 名称/描述/权限树 | T4.7、T2.5 | 权限勾选可提交 |
| T5.8 | 分组权限 | 加载已有权限、半选状态、差异保存 | T4.7、T2.5 | 只提交增删差异 |
| T5.9 | 日志页 | 筛选、搜索、高亮、无限加载 | T4.7、T3.2 | 关键字高亮不使用 HTML 注入 |
| T5.10 | 图书列表/表单 | 列表、编辑/删除、新建/编辑表单 | T4.7、T3.3 | 权限控制删除 |
| T5.11 | 个人中心 | 昵称、邮箱、react-easy-crop 6.2.4 头像裁剪上传、改密 | T4.7、T3.4 | 改密后回登录页 |
| T5.12 | 404、无权限与空闲登出 | 404 页、无权限提示、60 分钟空闲登出 | T4.8 | 路由兜底正确；空闲后回登录页 |
| T5.13 | E2E | 5 条业务主流程 + 响应式场景 Playwright | T5.1–T5.12 | 全部通过 |

### M6：加固、部署与交付（4 人日）

| ID | 任务 | 产出 | 依赖 | 验收 |
| --- | --- | --- | --- | --- |
| T6.1 | 契约回归 | 32 接口 fixture 回放 | M3 | 全绿 |
| T6.2 | 安全测试 | 越权、令牌、上传、注入、CORS、限流 | M3、M5 | 清单全部通过 |
| T6.3 | 性能测试 | 10 万日志基准、Lighthouse、包体积 | M5 | 达到 NFR 阈值 |
| T6.4 | 容器化（可选） | api/web Dockerfile、compose、nginx | M5 | 默认单机可启动；可选 compose 起 api + web |
| T6.5 | 文档 | README、部署、运维、回滚、API 说明 | T6.4 | 新开发者 10 分钟跑通 |
| T6.6 | 数据迁移（可选） | 旧库 → 新库脚本与校验报告 | T6.4 | 可重复执行；计数一致 |
| T6.7 | 发布检查 | 检查清单、回滚演练 | T6.1–T6.6 | 发布包可回滚 |

## 4. 契约优先工作流

### 4.1 旧接口行为录制

`scripts/capture_contract.py` 使用旧 Flask 应用的 test client：

1. 以测试配置启动旧应用（内存 SQLite、种子数据）。
2. 执行登录获取 root/guest token。
3. 对 32 个接口依次发起成功请求与至少一个失败请求。
4. 记录：状态码、`content-type`、响应 JSON、关键 Header。
5. 输出到 `contracts/fixtures/<method>_<path>.json`，对动态字段（token、时间、ID、URL）做占位符替换。

动态字段规范化规则：

| 字段 | 处理 |
| --- | --- |
| `access_token` / `refresh_token` | 替换为 `<TOKEN>` |
| `id` / `user_id` / `group_id` / `permission_id` | 按出现顺序替换为 `<ID:n>` |
| `create_time` / `update_time` / `time` | 替换为 `<TIMESTAMP>` |
| `url` | 替换为 `<URL>` |
| `tag` | 替换为 `<CAPTCHA_TAG>` |
| `request` 中的路径参数 | 保留实际路径 |

### 4.2 新后端契约测试

```python
@pytest.mark.parametrize("fixture", load_fixtures("contracts/fixtures"))
def test_contract(client, fixture):
    response = client.request(
        fixture["method"],
        fixture["path"],
        headers=fixture["headers"],
        json=fixture.get("body"),
        params=fixture.get("query"),
    )
    assert response.status_code == fixture["status"]
    assert normalize(response.json()) == fixture["response"]
```

对无法完全复现的动态字段，断言“字段存在 + 类型正确 + 关键值匹配”，而不是逐字节相等。

### 4.3 旧测试迁移映射

| 旧测试文件 | 新测试文件 | 处理 |
| --- | --- | --- |
| `test_auth.py` | `test_auth.py` | 直接迁移 |
| `test_user.py` | `test_profile.py` | 直接迁移 |
| `test_admin.py` | `test_admin_users.py`、`test_admin_groups.py`、`test_admin_permissions.py` | 拆分 |
| `test_book.py` | `test_books.py` | 直接迁移 |
| `test_log.py` | `test_logs.py` | 直接迁移 |
| `test_health.py` | `test_health.py` | 直接迁移 |
| `test_openapi.py` | `test_openapi.py` | 改为导出快照；文档路径由 `/apidoc/*` 变为 `/docs`、`/openapi.json` |
| `test_permission_sync.py` | `test_permission_sync.py` | 改为断言 24 条权限 |
| `test_session_revocation.py` | `test_session_revocation.py` | 直接迁移；新增旧 scrypt 兼容校验，断言新密码使用 Argon2id 且登录后升级 |
| `test_hardening.py` | `test_hardening.py` | 直接迁移 |
| `test_quality_fixes.py` | `test_regressions.py` | 按用例迁移：改密失败、验证码损坏、日志脱敏、事务回滚、伪造 refresh |
| `test_framework_core.py` | `test_core.py` | 保留上传校验；验证码断言保持 PNG data URI，仅在安装 Pillow 时运行 |
| `test_plugin_loader.py` | — | 插件不在范围，标记跳过并记录 |

### 4.4 OpenAPI 与前端类型

```bash
# 后端导出
cd lin-cms-fastapi
uv run python scripts/export_openapi.py ../../contracts/openapi.json

# 前端生成类型
cd lin-cms-react
pnpm dlx openapi-typescript@7.13.0 ../../contracts/openapi.json -o src/lib/api/schema.d.ts
```

CI 步骤：

1. 导出 OpenAPI。
2. 重新生成 `schema.d.ts`。
3. `git diff --exit-code`；有差异则失败，要求提交同步更新。

## 5. 测试计划

### 5.1 后端测试矩阵

| 类别 | 用例 | 断言重点 |
| --- | --- | --- |
| 健康检查 | `GET /health` | 200、`status=ok`、版本非空 |
| 登录 | 正确、错误密码、不存在用户、缺字段、验证码错误 | 200 / 400 / 404 / 400 / 400；token 非空 |
| 刷新 | 正确 refresh、用 access 刷新、过期、吊销 | 200 / 400 / 422 / 401 |
| 登出 | 只登出 access、带 refresh 一起登出 | 后续请求 401；消息含“吊销” |
| 改密 | 正确旧密码、错误旧密码、两次不一致、长度不足 | 200 / 400；旧 token 全失效 |
| 密码哈希 | 新密码 Argon2id、旧 scrypt 可登录 | 新哈希前缀为 argon2；旧哈希登录后升级 |
| 用户管理 | 分页、分组过滤、创建、重名、重复邮箱、更新、重置密码、删除、删 Root、向 Root 组加人、改 Root 用户分组 | 字段与错误码 |
| 分组管理 | 列表、详情、创建、重名、更新、删除、删 Guest/Root、删有用户组 | 字段与错误码 |
| 权限 | 清单、分配、回收、重复分配、无效 ID | 幂等、立即生效 |
| 日志 | 分页、用户过滤、时间过滤、关键字、`%` 转义、用户清单 | total/items/顺序 |
| 图书 | 列表、详情、搜索、创建、更新、删除、404、无权限删除 | 成功码 12/13/14 |
| 文件 | 单文件、多文件、重复 MD5、超大小、超数量、非法扩展名 | 返回结构/错误码 |
| 权限同步 | 24 条权限、幂等、mount 变更 | 数据库与代码一致 |

验证码相关用例标记 `skipif(未安装 Pillow)`；默认关闭验证码。
| 行为日志 | 注册、改密、删用户、建/删分组成功后写入日志 | 每次成功操作都有对应 `lin_log` |
| 用户名复用 | 删除用户后重建同名用户并登录 | 新用户可登录，旧记录不遮蔽 |
| 删除清理 | 删除用户后 identity/user_group 无残留 | 关联表计数为 0 |

### 5.2 前端测试矩阵

| 类别 | 用例 | 工具 |
| --- | --- | --- |
| 工具函数 | token 规范化、权限扁平化、分页转换、日期格式化 | Vitest |
| API 客户端 | 附 token、错误映射、刷新单飞、重放 | Vitest + MSW |
| Zustand auth store | 登录写入、登出清理、刷新恢复 | Vitest |
| RHF/Zod 表单 | 登录、用户、分组、图书、改密校验 | Testing Library |
| 组件 | TanStack Table DataTable 排序/空状态、权限树半选、ConfirmDialog | Testing Library |
| 路由守卫 | 未登录、无权限、管理员旁路 | Testing Library |
| E2E | 5 条业务主流程 + 移动端侧栏 | Playwright |

### 5.3 E2E 场景

1. **登录与会话**：登录 → 工作台 → 刷新页面仍登录 → 登出 → 受保护页跳登录。
2. **用户生命周期**：创建用户 → 列表可见 → 编辑分组 → 重置密码 → 新密码登录 → 删除用户 → 无法登录。
3. **分组与权限**：创建分组 → 分配“查询日志” → 将用户加入分组 → 用户可看日志 → 回收权限 → 用户失权。
4. **图书 CRUD**：新建 → 列表 → 编辑 → 删除 → 列表消失。
5. **日志筛选**：按关键字/用户/日期筛选 → 高亮 → 加载更多 → 返回全部。
6. **响应式**：375 px 视口打开菜单 → 导航 → 菜单自动关闭。

### 5.4 安全测试清单

- [ ] 无 token、伪造签名、过期 token、错误类型 token 均返回 401/422。
- [ ] 登出后的 access/refresh 均不可用。
- [ ] 改密/重置密码后旧 token 全失效。
- [ ] 普通用户访问 `/cms/admin/**` 返回 401。
- [ ] 未授权分组删除图书返回 401。
- [ ] Guest/Root 组不可删除；Root 用户不可删除；Root 组不可添加用户；Root 用户分组不可修改。
- [ ] 上传 `.php`、双扩展名、伪造 Content-Type 被拒。
- [ ] 日志搜索 `%`、`_` 按字面量处理。
- [ ] CORS 仅允许白名单来源。
- [ ] 登录限流生效，返回 429。
- [ ] 日志中不出现密码/token。

### 5.5 性能测试

| 场景 | 数据量 | 指标 |
| --- | --- | --- |
| 日志分页 | 100,000 条 | p95 < 500 ms |
| 用户分页 | 10,000 用户 | p95 < 300 ms |
| 图书列表 | 10,000 本 | p95 < 300 ms |
| 登录 | 并发 50 | p95 < 500 ms，无错误 |
| 首屏 | 桌面 | Lighthouse Performance ≥ 90 |
| 初始 JS | — | gzip < 350 KB |

## 6. CI/CD 设计（2026-10-20 已落地核心部分）

`.github/workflows/ci.yml` 已落地四个 job（backend / frontend / cli / contract-drift），
命令统一调用根 `Makefile` 目标（与本地一致）；E2E、安全扫描、docker 构建
未纳入 CI，本地按需执行 `make frontend-e2e` 等。原始结构示意：

```yaml
jobs:
  api-quality:
    steps: [ruff check, ruff format --check]   # mypy 可选
  api-test:
    # 默认无外部服务；可选矩阵再启用 PostgreSQL/MySQL
    steps: [uv sync --frozen, alembic upgrade head, pytest --cov]
  web-quality:
    steps: [pnpm install --frozen-lockfile, biome check, tsc --noEmit]
  web-test:
    steps: [vitest run --coverage, pnpm build]
  contract:
    steps: [export openapi, regenerate types, git diff --exit-code]
  e2e:
    steps: [build web, start api and web, playwright test]
  security:
    steps: [pip-audit, pnpm audit --prod, gitleaks]
  docker:
    steps: [docker build api, docker build web]   # 可选
```

门禁：

- 任一 job 失败禁止合并。
- 后端覆盖率低于 80% 失败。
- 前端语句覆盖率低于 70% 失败。
- OpenAPI 类型漂移失败。
- 明文密钥扫描失败。

## 7. 环境与配置

### 7.1 本地开发

前置：Python ≥3.12（实施环境 3.13）、uv、Node.js LTS、pnpm；精确版本以 `lin-cms-fastapi/uv.lock` 与 `lin-cms-react/pnpm-lock.yaml` 为准（计划期版本号 3.15.0/24.22.0/12.14.0 系笔误，已按实际修正）。

```bash
# 1. 后端（无需任何外部服务，SQLite 文件自动创建）
cd lin-cms-fastapi
cp .env.example .env
uv sync --frozen
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000

# 2. 前端
cd lin-cms-react
pnpm install --frozen-lockfile
pnpm dev

# 3. 全量检查
make lint
make test
```

如需验证码：`uv sync --frozen --extra captcha` 安装 Pillow 13.0.0，并设置 `LIN_LOGIN_CAPTCHA=true`。

### 7.2 生产部署

```bash
# 默认：单机单进程 + SQLite
cd lin-cms-fastapi
uv run alembic upgrade head
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1

cd lin-cms-react
pnpm build
# 由 Nginx 或 FastAPI 托管 dist/

# 可选：仅 api + web 的 Docker Compose
docker compose -f lin-cms-fastapi/infra/docker-compose.yml up -d --build
curl -f http://localhost:8000/health
```

### 7.3 回滚

1. 保留上一版本镜像标签或代码目录。
2. 数据库迁移只做向前兼容变更；破坏性变更分两次发布（先加列、后删列）。
3. 回滚步骤：停止新进程/容器 → 启动上一版本 → 如需回滚迁移，执行 `alembic downgrade -1`（仅限已验证的迁移）。
4. 上传目录与 SQLite 数据库文件（或 PostgreSQL/MySQL 备份）独立恢复。

### 7.4 切换 PostgreSQL/MySQL

目标版本：PostgreSQL 18.6 或 MySQL 9.7.2 LTS。

```bash
cd lin-cms-fastapi

# PostgreSQL
uv add psycopg2-binary@2.9.13
export LIN_DATABASE_URL='postgresql+psycopg2://user:pass@localhost:5432/lincms'
uv run alembic upgrade head

# MySQL
uv add pymysql@1.2.3
export LIN_DATABASE_URL='mysql+pymysql://user:pass@localhost:3306/lincms?charset=utf8mb4'
uv run alembic upgrade head
```

切换后跑一遍可选数据库矩阵测试；业务代码与迁移脚本不做方言分支。

### 7.5 依赖升级策略

- 每月检查一次官方 registry 的 `latest` 标签；只升级正式版。
- 升级在独立分支执行：后端 `uv lock --upgrade`，前端 `pnpm update --latest`；跑全量测试、契约测试与构建后提交锁文件。
- 安全公告（CVE）优先处理，可跳过月度节奏立即升级。
- 跨大版本升级必须单独 PR，并在 PR 描述中列出破坏性变更与回滚方案。
- Watermelon/shadcn 复制组件更新时，对比 registry 源文件，更新 `components.lock.json` 中的 sha256 与拉取日期。
- 禁止在 CI 或生产构建中使用 `latest` 标签直接安装未锁定版本。

## 8. 旧数据迁移（可选，T6.6）

### 8.1 字段映射

| 旧表/字段 | 新表/字段 | 处理 |
| --- | --- | --- |
| `lin_user.avatar`（列名） | `lin_user.avatar` | 直接复制 |
| `lin_user.token_version` | `lin_user.token_version` | 直接复制 |
| `lin_user_identity.credential`（scrypt） | 同字段 | 原样保留旧 scrypt；用户下次登录成功后升级为 Argon2id |
| `is_deleted` / `delete_time`（分组/图书/文件） | `deleted_token` / `deleted_at` | 活跃行 `deleted_token=0`；已删除行 `deleted_token=id`、`deleted_at=delete_time` |
| `lin_group.level` | 同字段 | 直接复制 |
| `lin_permission.name/module/mount` | 同字段 | 按 `(name, module)` 合并 |
| `lin_group_permission` | 同表 | 按名称解析新权限 ID |
| `lin_log` | 同表 | 保留最近 N 天，按配置 |
| `lin_file.path` | 同字段 | 复制文件到新上传目录 |
| `lin_book` | 同表 | 直接复制 |
| 时间字段 | UTC | 统一转换并记录原始时区 |

### 8.2 迁移步骤

1. 备份旧库与上传目录。
2. 导出旧库为 CSV/SQL。
3. 运行 `scripts/migrate_legacy.py --dry-run`，输出计数与冲突报告。
4. 正式导入；保留原 ID。
5. 校验：用户数、分组数、权限数、图书数、日志数、文件数一致。
6. 重置目标数据库自增序列到最大 ID + 1（SQLite 可省略）。
7. 抽样登录验证（旧密码可登录，旧 scrypt 兼容，并完成 Argon2id 升级）。
8. 保留旧库只读一个发布周期。

## 9. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
| --- | --- | --- | --- |
| 旧行为存在未记录细节 | 中 | 高 | fixture 录制 + 旧测试迁移 + 差异评审 |
| Watermelon 组件与 shadcn 版本不兼容 | 中 | 中 | 锁定依赖版本；组件复制后本地维护 |
| 前端页面量大导致延期 | 中 | 高 | M4 先交付通用组件；页面并行；E2E 提前 |
| SQLite 与 PostgreSQL/MySQL 可移植性 | 中 | 中 | 只用通用类型；默认 CI 跑 SQLite，可选矩阵跑其他数据库 |
| 旧密码哈希格式不兼容 | 低 | 中 | 解析 Werkzeug scrypt 参数并做兼容测试；登录后升级 Argon2id |
| SQLite 单写者与多 worker | 中 | 中 | 默认 `--workers 1`；WAL + busy_timeout；扩容时切 PostgreSQL/MySQL |
| 进程内限流在多实例下不一致 | 低 | 中 | 默认单实例；多实例时在反向代理层限流 |
| 上传目录丢失 | 低 | 高 | 卷挂载 + 定期备份 |
| 范围膨胀（通知/插件） | 中 | 中 | 文档明确 Out of Scope；变更走评审 |
| 最新大版本生态不兼容（如 TS 7 / Vite 8 / React Router 8） | 中 | 中 | M0 兼容性冒烟；不兼容时回退到最新可用稳定版并在 ADR 记录 |

## 10. 交付物清单

- [ ] `lin-cms-fastapi`：FastAPI 服务、迁移、种子、测试、可选 Dockerfile。
- [ ] `lin-cms-react`：React SPA、Watermelon 组件、测试、可选 Dockerfile。
- [ ] `lin-cms-react/src/lib/api`：OpenAPI 生成的类型与 openapi-fetch 客户端。
- [ ] `contracts/openapi.json` 与 `contracts/fixtures/`。
- [ ] `lin-cms-fastapi/infra/docker-compose.yml`（可选，仅 api + web）、`nginx.conf`、`.env.example`。
- [ ] `docs/00`、`01`、`02` 三份文档。
- [ ] 根 `README.md`、`Makefile`。
- [ ] CI 配置。
- [ ] 可选的旧数据迁移脚本与报告。

## 10.1 增量里程碑：Agent 接入（2026-10，详见[实施计划书](./05-agent-access-implementation-plan.md)）

20 个任务按依赖顺序：配置/错误码 → 模型+迁移 → schema 校验 → 类型管理 API →
分组内容权限（同步隔离）→ Token 服务 → 能力交集与认证主体 → Token API+吊销挂钩 →
内容记录 API（受限过滤/scan cap）→ 审计 → `/mcp` 六工具 → OpenAPI 登记 → 前端
API 封装 → 内容类型向导 → 分组内容权限 → 内容工作区 → Token 管理+接入向导 → 审计页 →
CLI 工程（后变更为独立 **Go** 工程 `lin-cms-cli/`，交叉编译单文件）→ 文档同步与全量验证。
测试矩阵扩展见规格书 §11；前端类型沿用**手写 `types`/`agent-types`**（非 openapi-typescript 生成）。

## 11. Definition of Done

- [ ] 32 个接口契约测试全绿。
- [ ] Agent 增量：后端用例、前端用例、CLI（Go）用例全绿；`/mcp` 未授权 401 与六工具闭环有测试钉死；OpenAPI 已重导出且旧路径零漂移。
- [ ] 旧 pytest 用例迁移后全绿（插件用例标记跳过）。
- [ ] 后端覆盖率 ≥ 80%，核心模块 ≥ 90%。
- [ ] 前端语句覆盖率 ≥ 70%。
- [ ] Playwright 5 条业务主流程 + 响应式场景全绿。
- [ ] 安全测试清单全部通过。
- [ ] 性能指标达标。
- [ ] 默认单机命令可启动；可选 Docker Compose（仅 api + web）。
- [ ] README 10 分钟跑通。
- [ ] 无明文密钥、无死代码、无未使用依赖。
- [ ] `uv.lock` 与 `pnpm-lock.yaml` 已提交；CI 使用 frozen lockfile；所有依赖为正式版且与 1.1 版本表一致。
- [ ] Watermelon/shadcn 复制组件已记录 `components.lock.json`。

## 12. 首批行动（前 3 天）

### Day 1：工程与契约

1. 创建 monorepo 目录与根配置。
2. 初始化 `lin-cms-fastapi`（uv + FastAPI 最小应用）与 `lin-cms-react`（Vite + React + TS）。
3. 写 `scripts/capture_contract.py`，在旧 Flask 工程上跑通 fixture 录制。
4. 提交 `contracts/fixtures/` 与契约测试骨架。

### Day 2：认证纵向切片

1. 实现配置、数据库会话、用户/身份/分组/权限模型。
2. 实现错误信封与校验异常映射。
3. 实现 JWT 签发/校验与 Argon2id（含旧 scrypt 兼容）。
4. 实现登录、刷新、登出、个人信息、改密。
5. 让 `test_auth.py` 与 `test_session_revocation.py` 迁移用例转绿。

### Day 3：权限与首个前端页面

1. 实现权限注册表与 24 条权限同步。
2. 实现 `require_root` / `require_permission`。
3. 实现用户列表与分组列表接口。
4. 前端完成 shadcn + Watermelon 初始化与登录页骨架。
5. 打通“登录 → 获取个人信息 → 展示布局壳”最小闭环。

## 13. 评审与启动条件

启动编码前需要确认：

1. 三份文档的范围、默认决策、接口契约无异议。
2. `apps/` monorepo 形态确认。
3. SQLite 默认、可选 PostgreSQL/MySQL、无外部中间件的部署形态确认。
4. 1.1 版本表与锁文件策略确认。
5. 通知/SSE/插件不做的范围确认。
6. 旧数据迁移是否纳入本期确认。

确认后按 M0 → M6 执行；每个里程碑结束做一次演示与回顾，未通过出口标准不进入下一阶段。
