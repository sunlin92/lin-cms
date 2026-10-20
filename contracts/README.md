# contracts：对外 API 契约（生成物）

`openapi.json` 由后端导出，**不要手工编辑**：

```bash
cd lin-cms-fastapi
uv run python scripts/export_openapi.py            # 写回本目录 openapi.json
```

约定（见 `docs/01-planning-proposal.md` §6 与 `AGENTS.md`）：

- 改任何接口（路径/请求/响应/错误码）后必须重新导出本文件，再提交；
- 旧 `/cms/**`、`/v1/**`、`/health` 契约冻结，新增能力走 `/api/v1/**` 与 `/mcp`；
- 契约测试 `lin-cms-fastapi/tests/test_openapi_contract.py` 钉死旧路径零漂移
  与新路径登记，防手工漂移。
