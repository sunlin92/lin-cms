## 变更说明

<!-- 做了什么、为什么。涉及契约的改动请说明文档同步情况 -->

## 影响范围

- [ ] 后端（lin-cms-fastapi）
- [ ] 前端（lin-cms-react）
- [ ] CLI（lin-cms-cli）
- [ ] 文档 / 契约（docs、contracts）
- [ ] 工程化（Makefile、CI、.github）

## 自检清单

- [ ] 新行为 / 缺陷修复有对应测试
- [ ] `make test-all` 通过
- [ ] `make check-all` 通过
- [ ] 改过接口：已运行 `make backend-openapi` 重新导出契约
- [ ] 未提交 `.env`、`data/*.db`、`dist/` 等生成物
- [ ] 安全敏感面（认证 / 授权 / 上传 / 限流 / 令牌）改动已读 docs/01 对应章节并保持测试覆盖
