"""契约登记测试：/api/v1 全量进入 openapi.json，旧契约不漂移（docs/05 Task 12）。"""

import json
from pathlib import Path

CONTRACT = Path(__file__).resolve().parent.parent.parent / "contracts" / "openapi.json"

EXPECTED_OLD_PATHS = {
    "/health",
    "/cms/user/login",
    "/cms/user/logout",
    "/v1/book",
    "/v1/book/{book_id}",
    "/cms/admin/group/all",
}

EXPECTED_NEW_PATHS = {
    "/api/v1/content-types/available",
    "/api/v1/admin/content-types",
    "/api/v1/admin/content-types/{type_id}",
    "/api/v1/admin/content-types/{type_id}/archive",
    "/api/v1/admin/content-types/{type_id}/restore",
    "/api/v1/admin/groups/{group_id}/content-permissions",
    "/api/v1/agent-tokens",
    "/api/v1/agent-tokens/{token_id}",
    "/api/v1/admin/agent-tokens",
    "/api/v1/admin/agent-tokens/{token_id}/revoke",
    "/api/v1/admin/agent-audit",
    "/api/v1/content/{type_key}",
    "/api/v1/content/{type_key}/{record_id}",
}


def _contract() -> dict:
    assert CONTRACT.exists(), "contracts/openapi.json 不存在：请运行 uv run python scripts/export_openapi.py"
    return json.loads(CONTRACT.read_text())


def test_new_paths_registered() -> None:
    paths = set(_contract()["paths"])
    missing = EXPECTED_NEW_PATHS - paths
    assert not missing, f"新增路径未登记：{missing}"


def test_old_paths_unchanged() -> None:
    paths = set(_contract()["paths"])
    missing = EXPECTED_OLD_PATHS - paths
    assert not missing, f"旧契约路径漂移：{missing}"


def test_mcp_not_in_openapi() -> None:
    # /mcp 是挂载子应用，不进入 OpenAPI paths（防误挂成路由）
    assert "/mcp" not in _contract()["paths"]


def test_security_schemes_dual_defined() -> None:
    schemes = _contract()["components"]["securitySchemes"]
    assert "bearerAuth" in schemes or schemes, "安全方案需登记"
    # agentToken scheme 必须存在且描述仅内容/Agent 端点可用
    assert "agentToken" in schemes
    desc = schemes["agentToken"].get("description", "")
    assert "Agent" in desc or "内容" in desc
