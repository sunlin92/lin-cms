# lin-cms CLI（Go）

Lin CMS 的本机命令行（Go 1.25+）：Agent Token 安全存储、连通性测试与 `stdio` MCP 服务器。
经 HTTPS 调用 CMS REST API（`/api/v1/**`），与后端 `/mcp` 走同一服务端授权链；
不直连数据库、不持有数据库密码。技术栈：官方
[`modelcontextprotocol/go-sdk v1.8.0`](https://github.com/modelcontextprotocol/go-sdk) +
[`zalando/go-keyring v0.2.8`](https://github.com/zalando/go-keyring)（macOS Keychain /
Windows Credential Manager / Linux Secret Service）。

## 命令

| 命令 | 说明 |
| --- | --- |
| `lin-cms init` | 输入 CMS Base URL（校验 `/health`）与 Agent Token；Token 入系统凭证库 |
| `lin-cms test` | 连通性 + Token + 内容类型只读探测 |
| `lin-cms config [--out path]` | 输出通用 MCP 客户端配置 JSON（`${LIN_CMS_AGENT_TOKEN}` 占位，无明文） |
| `lin-cms mcp` | 运行 stdio MCP 服务器（stdout 仅协议帧，诊断走 stderr 且脱敏） |
| `lin-cms logout` | 删除本机凭证；不隐式吊销服务端 Token |

无凭证库环境：设置 `LIN_CMS_BASE_URL` 与 `LIN_CMS_AGENT_TOKEN` 环境变量。
**绝不**把 Token 明文写入配置文件、MCP JSON 或 shell 历史。

## 构建与测试

```bash
go test ./... && go vet ./...
./build.sh    # 交叉编译五平台单文件制品（dist/ + sha256）
```

平台：macOS arm64/x86_64、Linux amd64/arm64、Windows x86_64——Go 交叉编译一次产出全部。

## 安全说明

- Token 仅存系统凭证库；`~/.config/lin-cms/config.json` 只含非秘密的 base_url
- 所有 stderr 诊断经 `internal/redact` 脱敏（`lin_agent_***`）
- 前端「Agent 接入」向导生成的配置片段与本 CLI 约定一致（command `lin-cms` + env 占位符）
