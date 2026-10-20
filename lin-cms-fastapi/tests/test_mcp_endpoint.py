"""MCP 端点测试：传输层鉴权 + 六工具 + 错误映射（docs/05 Task 11，规格 §6）。

直接向 /mcp 发 JSON-RPC 帧（initialize → notifications/initialized → tools/list →
tools/call），兼容 JSON 与 SSE 两种响应形态。
"""

import json

import pytest

from app.models import ContentType, GroupContentPermission, UserGroup
from app.repositories import user_repo
from app.services import agent_token_service

MCP_HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}

_SEQ = 0


def _parse_response(rv) -> dict:
    body = rv.text
    if rv.headers.get("content-type", "").startswith("text/event-stream"):
        for line in body.splitlines():
            if line.startswith("data:"):
                return json.loads(line[5:].strip())
        raise AssertionError(f"SSE 响应无 data 帧：{body[:200]}")
    return json.loads(body)


def _rpc(client, method: str, params: dict | None = None, *, headers: dict, msg_id: int | None = 1):
    payload: dict = {"jsonrpc": "2.0", "method": method}
    if params is not None:
        payload["params"] = params
    if msg_id is not None:
        payload["id"] = msg_id
    rv = client.post("/mcp", headers={**MCP_HEADERS, **headers}, json=payload)
    return rv


def _handshake(client, headers: dict) -> None:
    rv = _rpc(
        client,
        "initialize",
        {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "pytest", "version": "0"},
        },
        headers=headers,
    )
    assert rv.status_code == 200, rv.text
    rv = _rpc(client, "notifications/initialized", {}, headers=headers, msg_id=None)
    assert rv.status_code in (200, 202), rv.text


@pytest.fixture()
def mcp_env(app):
    """类型 + Guest 全操作授权 + 独立用户 + agent token（read+create+update+delete）。"""
    global _SEQ
    from datetime import datetime

    from app.schemas.content_type import field_specs_to_json, validate_type_schema

    _SEQ += 1
    tag = f"{datetime.now().timestamp()}-{_SEQ}"
    with app.state.sessionmaker() as db:
        specs = validate_type_schema(
            [
                {"key": "title", "label": "标题", "type": "text", "required": True},
                {"key": "views", "label": "阅读", "type": "number"},
            ],
            max_fields=100,
        )
        ct = ContentType(key=f"mcp-{tag}", name="M", schema_json=field_specs_to_json(specs))
        db.add(ct)
        db.flush()
        db.add(
            GroupContentPermission(
                group_id=2,
                content_type_id=ct.id,
                can_read=True,
                can_create=True,
                can_update=True,
                can_delete=True,
            )
        )
        user = user_repo.create_user(db, username=f"mcp-{tag}")
        user_repo.set_password(db, user, "pass1234x")
        db.add(UserGroup(user_id=user.id, group_id=2))
        db.commit()
        result = agent_token_service.create_token(
            db,
            user_id=user.id,
            name="mcp",
            ttl_days=30,
            scope_entries=[{"content_type_id": ct.id, "ops": ["read", "create", "update", "delete"]}],
        )
        db.commit()
    return ct.key, result["token"]


def _agent_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_mcp_unauthorized_initialize_blocked(client):
    rv = _rpc(
        client,
        "initialize",
        {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "t", "version": "0"},
        },
        headers={},
    )
    assert rv.status_code == 401, rv.text
    # 吊销/伪造 token 同样 401（不进入 MCP 会话）
    rv = _rpc(
        client,
        "tools/list",
        {},
        headers={"Authorization": "Bearer lin_agent_deadbeef_fakesecretfakesecret"},
    )
    assert rv.status_code == 401


def test_mcp_tools_list_and_content_flow(client, mcp_env):
    type_key, token = mcp_env
    headers = _agent_headers(token)
    _handshake(client, headers)
    rv = _rpc(client, "tools/list", {}, headers=headers)
    assert rv.status_code == 200, rv.text
    result = _parse_response(rv)["result"]
    tool_names = {t["name"] for t in result["tools"]}
    assert tool_names == {
        "list_content_types",
        "list_content_records",
        "get_content_record",
        "create_content_record",
        "update_content_record",
        "delete_content_record",
    }
    # delete 工具声明破坏性
    delete_tool = next(t for t in result["tools"] if t["name"] == "delete_content_record")
    assert delete_tool.get("annotations", {}).get("destructiveHint") is True

    # 只返回有权类型摘要
    rv = _rpc(client, "tools/call", {"name": "list_content_types", "arguments": {}}, headers=headers)
    payload = _parse_response(rv)
    text = payload["result"]["content"][0]["text"]
    summary = json.loads(text)
    assert any(item["key"] == type_key for item in summary)

    # 创建 → 读取 → 更新 → 删除 闭环
    rv = _rpc(
        client,
        "tools/call",
        {
            "name": "create_content_record",
            "arguments": {"type_key": type_key, "data": {"title": "来自MCP", "views": 1}},
        },
        headers=headers,
    )
    created = json.loads(_parse_response(rv)["result"]["content"][0]["text"])
    assert created["record_id"] > 0 and created["fields"]["title"] == "来自MCP"
    rid = created["record_id"]

    rv = _rpc(
        client,
        "tools/call",
        {"name": "get_content_record", "arguments": {"type_key": type_key, "record_id": rid}},
        headers=headers,
    )
    got = json.loads(_parse_response(rv)["result"]["content"][0]["text"])
    assert got["fields"]["views"] == 1

    rv = _rpc(
        client,
        "tools/call",
        {"name": "list_content_records", "arguments": {"type_key": type_key, "page": 0, "count": 5}},
        headers=headers,
    )
    listed = json.loads(_parse_response(rv)["result"]["content"][0]["text"])
    assert listed["total"] >= 1

    rv = _rpc(
        client,
        "tools/call",
        {"name": "update_content_record", "arguments": {"type_key": type_key, "record_id": rid, "patch": {"views": 9}}},
        headers=headers,
    )
    updated = json.loads(_parse_response(rv)["result"]["content"][0]["text"])
    assert updated["fields"]["views"] == 9

    rv = _rpc(
        client,
        "tools/call",
        {"name": "delete_content_record", "arguments": {"type_key": type_key, "record_id": rid}},
        headers=headers,
    )
    assert _parse_response(rv)["result"]["isError"] is False


def test_mcp_tool_error_mapping_no_secret_leak(client, mcp_env):
    type_key, token = mcp_env
    headers = _agent_headers(token)
    _handshake(client, headers)
    # 不存在模型 → isError + code 10320
    rv = _rpc(
        client,
        "tools/call",
        {"name": "get_content_record", "arguments": {"type_key": "no-such-type", "record_id": 1}},
        headers=headers,
    )
    payload = _parse_response(rv)
    assert payload["result"]["isError"] is True
    body = payload["result"]["content"][0]["text"]
    assert "10320" in body
    assert "lin_agent_" not in body and "lin_agent_" not in rv.text
    # 数据校验失败 → code 10331
    rv = _rpc(
        client,
        "tools/call",
        {"name": "create_content_record", "arguments": {"type_key": type_key, "data": {"views": "x"}}},
        headers=headers,
    )
    body = _parse_response(rv)["result"]["content"][0]["text"]
    assert "10331" in body


def test_mcp_scope_limited_tools_visibility(client, app, mcp_env):
    """token 只读 → list_content_types 不返回无权模型细节；写工具调用返回 10310。"""
    type_key, token = mcp_env
    # 造一个用户没有授权的类型
    with app.state.sessionmaker() as db:
        from datetime import datetime

        other = ContentType(key=f"mcp-other-{datetime.now().timestamp()}", name="O", schema_json="[]", status="active")
        db.add(other)
        db.commit()
        other_key = other.key
    headers = _agent_headers(token)
    _handshake(client, headers)
    rv = _rpc(client, "tools/call", {"name": "list_content_types", "arguments": {}}, headers=headers)
    summary = json.loads(_parse_response(rv)["result"]["content"][0]["text"])
    keys = {item["key"] for item in summary}
    assert other_key not in keys and type_key in keys


def _ratelimited_client(app_module):
    """独立应用：全局与 Agent 限流开启、阈值 3/分钟。"""
    from tests.conftest import make_app

    return make_app(rate_limit_enabled=True, agent_rate_limit_per_minute=3)


def test_mcp_and_agent_endpoints_rate_limited(app, client):
    """LIN_AGENT_RATE_LIMIT_ENABLED 开启时 /mcp 与 Agent 端点共享限流（docs/04 §12/§6.3）。"""
    from fastapi.testclient import TestClient

    from tests.conftest import make_app

    limited = make_app(rate_limit_enabled=True, agent_rate_limit_per_minute=3)
    with TestClient(limited) as limited_client:
        with limited.state.sessionmaker() as db:
            # 独立应用有独立内存库；种子 root 已建（lifespan）
            from app.core.permissions import GUEST_LEVEL
            from app.models import ContentType, Group, GroupContentPermission, UserGroup
            from app.repositories import user_repo
            from app.schemas.content_type import field_specs_to_json, validate_type_schema
            from app.services import agent_token_service

            specs = validate_type_schema([{"key": "title", "label": "标题", "type": "text"}], max_fields=100)
            ct = ContentType(key="rl-note", name="N", schema_json=field_specs_to_json(specs))
            db.add(ct)
            db.flush()
            guest = db.query(Group).filter(Group.level == GUEST_LEVEL, Group.deleted_token == 0).one()
            db.add(GroupContentPermission(group_id=guest.id, content_type_id=ct.id, can_read=True))
            user = user_repo.create_user(db, username="rl-user")
            user_repo.set_password(db, user, "pass1234x")
            db.add(UserGroup(user_id=user.id, group_id=guest.id))
            db.commit()
            result = agent_token_service.create_token(
                db,
                user_id=user.id,
                name="rl",
                ttl_days=1,
                scope_entries=[{"content_type_id": ct.id, "ops": ["read"]}],
            )
            db.commit()
            token = result["token"]

        headers = {"Authorization": f"Bearer {token}"}
        codes = []
        for _ in range(4):
            rv = _rpc(limited_client, "tools/list", {}, headers=headers)
            codes.append(rv.status_code)
        assert 429 in codes, codes
        body_429 = rv.text
        assert "rate" in body_429 or "频繁" in body_429


def test_mcp_read_updates_last_used(app, client, mcp_env):
    """MCP 只读工具调用也要持久化 last_used_at（docs/04 §3.4）。"""
    type_key, token_text = mcp_env
    headers = _agent_headers(token_text)
    _handshake(client, headers)
    rv = _rpc(client, "tools/call", {"name": "list_content_types", "arguments": {}}, headers=headers)
    assert rv.status_code == 200
    with app.state.sessionmaker() as db:
        from app.models import AgentToken

        token = db.query(AgentToken).filter(AgentToken.prefix == token_text.split("_")[2]).one()
        assert token.last_used_at is not None, "MCP 读调用后 last_used_at 必须落库"
