# 安全策略

## 支持版本

项目尚未发布稳定版本，仅支持 `main` 分支上的最新代码。

| 版本 | 支持状态 |
| --- | --- |
| main 分支最新提交 | ✅ |
| 其他分支 / 历史 commit | ❌ |

## 报告漏洞

发现安全问题请不要开公开 Issue，也不要在 PR 描述中展开细节。请使用 GitHub 的私密漏洞报告：

1. 打开仓库的 [Security Advisories](https://github.com/sunlin92/lin-cms/security/advisories/new)
2. 选择 **Report a vulnerability**（私密报告）
3. 描述问题、影响范围与复现步骤（可复现的请求或代码片段最有帮助）

收到报告后会尽快回应并评估。修复发布前请勿公开细节。

## 安全敏感面

以下模块的改动需要格外小心的评审：

- 认证与令牌：JWT 签发 / 刷新 / 黑名单（`lin-cms-fastapi/app/core/`）
- 授权与权限：24 条权限名称与 Root 判定
- 文件上传：单文件 / 单请求大小上限、文件类型白名单、本地存储路径
- 登录限流与 Agent Token 签发
- CLI 凭证存储：系统凭证库读写与 stdout 脱敏

## 部署提醒

- `LIN_SECRET_KEY` 必须由 `.env` 提供，生产环境使用高强度随机值，绝不入库。
- 生产部署必须修改 `LIN_BOOTSTRAP_ADMIN_PASSWORD`。
- 调整 CORS 来源、上传限制、限流参数、令牌有效期等安全默认值时，须同步更新 `docs/01-planning-proposal.md` 并补充测试。
