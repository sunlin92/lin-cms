# 更新日志

本项目的所有显著变更都记录在本文件中。

格式遵循 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- FastAPI 后端：与冻结契约兼容的完整重实现——认证与令牌黑名单、用户与分组管理、图书、日志、文件上传、登录限流、Agent Token 与 `/mcp` 端点。
- React 19 前端：登录退出、用户 / 分组 / 图书 / 日志管理、仪表盘、个人资料页与 Playwright E2E 主链路。
- Go CLI：`init/test/config/mcp/logout` 五命令，Agent Token 存系统凭证库，stdio MCP 桥，五平台单文件构建。
- 工作区资产：`docs/` 规划与实施文档（含 Agent 接入 03-05）、`contracts/openapi.json` 契约、根 Makefile 与 GitHub Actions CI。
