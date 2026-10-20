"""用户 Agent Token API 与吊销挂钩测试（docs/05 Task 8，规格 §5.3/§3.4）。"""

from app.models import ContentType, GroupContentPermission, UserGroup
from app.repositories import user_repo
from app.services import agent_token_service

_SEQ = 0


def _prepare(app, client, root_headers, *, ops=("read", "create"), username="tokuser"):
    """建类型 + Guest 组授权 + 建用户并入 Guest + 登录。"""
    global _SEQ
    from datetime import datetime

    _SEQ += 1
    with app.state.sessionmaker() as db:
        ct = ContentType(key=f"tokapi-{datetime.now().timestamp()}-{_SEQ}", name="T", schema_json="[]")
        db.add(ct)
        db.flush()
        flags = {
            "can_read": "read" in ops,
            "can_create": "create" in ops,
            "can_update": "update" in ops,
            "can_delete": "delete" in ops,
        }
        db.add(GroupContentPermission(group_id=2, content_type_id=ct.id, **flags))
        user = user_repo.create_user(db, username=username)
        user_repo.set_password(db, user, "pass1234x")
        db.add(UserGroup(user_id=user.id, group_id=2))
        db.commit()
        type_id = ct.id
        uid = user.id
    # 管理员注册该用户走旧 API 太绕——直接登录（密码已知）
    rv = client.post("/cms/user/login", json={"username": username, "password": "pass1234x"})
    assert rv.status_code == 200, rv.text
    headers = {"Authorization": "Bearer " + rv.json()["access_token"]}
    return type_id, uid, headers


def test_token_crud_and_one_time_plaintext(app, client, root_headers):
    type_id, uid, headers = _prepare(app, client, root_headers, username="tokuser-a")
    # 创建：一次性明文
    rv = client.post(
        "/api/v1/agent-tokens",
        headers=headers,
        json={"name": "我的Agent", "ttl_days": 30, "scope": [{"content_type_id": type_id, "ops": ["read"]}]},
    )
    assert rv.status_code == 200, rv.text
    body = rv.json()
    assert body["token"].startswith("lin_agent_"), rv.text
    assert body["prefix"] and body["expires_at"]
    # 列表：只有元数据，无明文、无摘要
    rv = client.get("/api/v1/agent-tokens", headers=headers)
    assert rv.status_code == 200
    raw = rv.text
    assert "lin_agent_" not in raw  # 列表永不返回明文
    items = rv.json()
    assert items and items[0]["prefix"] == body["prefix"]
    assert all("secret_digest" not in item and "token" not in item for item in items)
    assert items[0]["scope"][0]["ops"] == ["read"]
    # 列表后明文不可恢复（响应中不重复出现）
    rv = client.get("/api/v1/agent-tokens", headers=headers)
    assert "lin_agent_" not in rv.text
    # DELETE 本人 token
    token_id = items[0]["id"]
    rv = client.delete(f"/api/v1/agent-tokens/{token_id}", headers=headers)
    assert rv.status_code == 200
    with app.state.sessionmaker() as db:
        with pytest_raises():
            agent_token_service.authenticate(db, body["token"])


def pytest_raises():
    import pytest

    return pytest.raises(Exception)


def test_token_requires_login_and_isolation(app, client, root_headers):
    type_id, uid_a, headers_a = _prepare(app, client, root_headers, username="tokuser-b")
    rv = client.get("/api/v1/agent-tokens")
    assert rv.status_code == 401
    # 用户 B 无法看到/删除 A 的 token
    _, uid_b, headers_b = _prepare(app, client, root_headers, username="tokuser-c")
    rv = client.post(
        "/api/v1/agent-tokens",
        headers=headers_a,
        json={"name": "A-tok", "scope": [{"content_type_id": type_id, "ops": ["read"]}]},
    )
    token_id = rv.json()["token_id"] if rv.status_code == 200 else rv.json().get("token_id")
    rv = client.get("/api/v1/agent-tokens", headers=headers_b)
    assert all(item["id"] != token_id for item in rv.json())
    rv = client.delete(f"/api/v1/agent-tokens/{token_id}", headers=headers_b)
    assert rv.status_code == 404  # 他人 token 统一 404，降枚举


def test_scope_over_user_caps_rejected(app, client, root_headers):
    type_id, uid, headers = _prepare(app, client, root_headers, ops=("read",), username="tokuser-d")
    rv = client.post(
        "/api/v1/agent-tokens",
        headers=headers,
        json={"name": "bad", "scope": [{"content_type_id": type_id, "ops": ["read", "delete"]}]},
    )
    assert rv.status_code == 400
    assert rv.json()["code"] == 10341


def test_password_change_revokes_tokens(app, client, root_headers):
    type_id, uid, headers = _prepare(app, client, root_headers, username="tokuser-e")
    rv = client.post(
        "/api/v1/agent-tokens",
        headers=headers,
        json={"name": "e", "scope": [{"content_type_id": type_id, "ops": ["read"]}]},
    )
    plaintext = rv.json()["token"]
    # 改密（旧 API）
    rv = client.put(
        "/cms/user/change_password",
        headers=headers,
        json={"old_password": "pass1234x", "new_password": "newpass99x", "confirm_password": "newpass99x"},
    )
    assert rv.status_code == 200, rv.text
    with app.state.sessionmaker() as db:
        import pytest

        from app.core.errors import AgentTokenRevoked

        with pytest.raises(AgentTokenRevoked):
            agent_token_service.authenticate(db, plaintext)


def test_admin_reset_password_and_delete_user_revoke(app, client, root_headers):
    # 管理员重置密码
    type_id, uid, headers = _prepare(app, client, root_headers, username="tokuser-f")
    rv = client.post(
        "/api/v1/agent-tokens",
        headers=headers,
        json={"name": "f", "scope": [{"content_type_id": type_id, "ops": ["read"]}]},
    )
    plaintext = rv.json()["token"]
    from tests.conftest import find_user_id

    admin_uid = find_user_id(client, root_headers, "tokuser-f")
    rv = client.put(
        f"/cms/admin/user/{admin_uid}/password",
        headers=root_headers,
        json={"new_password": "reset998x", "confirm_password": "reset998x"},
    )
    assert rv.status_code == 200, rv.text
    with app.state.sessionmaker() as db:
        import pytest

        from app.core.errors import AgentTokenRevoked

        with pytest.raises(AgentTokenRevoked):
            agent_token_service.authenticate(db, plaintext)

    # 管理员代吊销（先建新 token）
    rv = client.post("/cms/user/login", json={"username": "tokuser-f", "password": "reset998x"})
    headers2 = {"Authorization": "Bearer " + rv.json()["access_token"]}
    rv = client.post(
        "/api/v1/agent-tokens",
        headers=headers2,
        json={"name": "f2", "scope": [{"content_type_id": type_id, "ops": ["read"]}]},
    )
    assert rv.status_code == 200, rv.text
    new_token_id = rv.json()["token_id"]
    rv = client.get("/api/v1/admin/agent-tokens", headers=root_headers, params={"count": 15})
    assert rv.status_code == 200
    assert any(item["id"] == new_token_id for item in rv.json()["items"])
    rv = client.post(
        f"/api/v1/admin/agent-tokens/{new_token_id}/revoke", headers=root_headers, json={"reason": "审计处置"}
    )
    assert rv.status_code == 200, rv.text
    # 非 Root 不能用管理端点
    rv = client.get("/api/v1/admin/agent-tokens", headers=headers2)
    assert rv.status_code in (401, 403)
    # 删除用户 → token 全部吊销
    rv = client.delete(f"/cms/admin/user/{admin_uid}", headers=root_headers)
    assert rv.status_code == 200, rv.text
    with app.state.sessionmaker() as db:
        from app.models import AgentToken

        # 用户删除后 token 行整体清理（比吊销更强：凭证不复存在）
        assert db.query(AgentToken).filter(AgentToken.user_id == admin_uid).count() == 0
