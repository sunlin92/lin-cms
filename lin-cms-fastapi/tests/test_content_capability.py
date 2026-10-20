"""内容能力授权服务与认证主体测试（docs/05 Task 6，规格 §4.2）。"""

import pytest

from app.api.deps import AgentTokenPrincipal, UserSessionPrincipal
from app.core.errors import ContentForbidden, ContentTypeArchived
from app.models import ContentType, Group, GroupContentPermission, UserGroup
from app.repositories import user_repo
from app.services import agent_token_service, content_capability_service
from app.services.group_content_permission_service import replace_group_grants, user_caps

_SEQ = 0


def _uid(db, *, groups: list[int]) -> int:
    global _SEQ
    _SEQ += 1
    from datetime import datetime

    user = user_repo.create_user(db, username=f"cap-{datetime.now().timestamp()}-{_SEQ}")
    for gid in groups:
        db.add(UserGroup(user_id=user.id, group_id=gid))
    db.commit()
    return user.id


def _type(db, *, status: str = "active") -> ContentType:
    global _SEQ
    _SEQ += 1
    ct = ContentType(key=f"cap-t{_SEQ}", name="T", schema_json="[]", status=status)
    db.add(ct)
    db.flush()
    return ct


def _grant(db, group_id: int, ct: ContentType, ops: tuple[str, ...]) -> None:
    flags = {
        "can_read": "read" in ops,
        "can_create": "create" in ops,
        "can_update": "update" in ops,
        "can_delete": "delete" in ops,
    }
    db.add(GroupContentPermission(group_id=group_id, content_type_id=ct.id, **flags))
    db.commit()


@pytest.fixture()
def db(app):
    with app.state.sessionmaker() as session:
        yield session


def _guest_group(db) -> Group:
    return db.query(Group).filter(Group.level == 2, Group.deleted_token == 0).one()


def _make_group(db, name: str) -> int:
    group = Group(name=name, info=name, level=3)
    db.add(group)
    db.flush()
    return group.id


def test_union_across_groups(db) -> None:
    ct = _type(db)
    g1, g2 = _make_group(db, "cap-g1"), _make_group(db, "cap-g2")
    _grant(db, g1, ct, ("read",))
    _grant(db, g2, ct, ("create", "delete"))
    uid = _uid(db, groups=[g1, g2])
    assert user_caps(db, uid, ct.id) == {"read", "create", "delete"}
    # 单组用户只看到该组能力
    uid2 = _uid(db, groups=[g1])
    assert user_caps(db, uid2, ct.id) == {"read"}


def test_archived_type_excluded_from_caps(db) -> None:
    ct = _type(db, status="archived")
    _grant(db, _guest_group(db).id, ct, ("read",))
    uid = _uid(db, groups=[_guest_group(db).id])
    assert user_caps(db, uid, ct.id) == set()


def test_token_scope_intersection(db) -> None:
    ct = _type(db)
    g = _make_group(db, "cap-g3")
    _grant(db, g, ct, ("read", "create"))
    uid = _uid(db, groups=[g])
    # token 只选 read → 有效能力 = {read,create} ∩ {read}
    result = agent_token_service.create_token(
        db, user_id=uid, name="t", ttl_days=30, scope_entries=[{"content_type_id": ct.id, "ops": ["read"]}]
    )
    principal = AgentTokenPrincipal(token_id=result["token_id"], user_id=uid, token_name="t")
    caps = content_capability_service.effective_caps(db, principal, ct.id)
    assert caps == {"read"}


def test_revoke_takes_effect_immediately(db) -> None:
    ct = _type(db)
    g = _make_group(db, "cap-g4")
    _grant(db, g, ct, ("read",))
    uid = _uid(db, groups=[g])
    result = agent_token_service.create_token(
        db, user_id=uid, name="t", ttl_days=30, scope_entries=[{"content_type_id": ct.id, "ops": ["read"]}]
    )
    principal = AgentTokenPrincipal(token_id=result["token_id"], user_id=uid, token_name="t")
    content_capability_service.require_cap(db, principal, ct.id, "read")  # 通过
    # 撤销分组授权 → 同一 token 立即失效（运行时交集）
    replace_group_grants(db, g, [])
    db.commit()
    with pytest.raises(ContentForbidden):
        content_capability_service.require_cap(db, principal, ct.id, "read")


def test_root_no_bypass(db) -> None:
    """Root 主体（会话）无内容授权时同样 403——Root 无内容旁路。"""
    ct = _type(db)
    root = db.query(Group).filter(Group.level == 1).one()
    root_user_id = _uid(db, groups=[root.id])
    principal = UserSessionPrincipal(user_id=root_user_id, is_root=True)
    with pytest.raises(ContentForbidden):
        content_capability_service.require_cap(db, principal, ct.id, "read")
    # 显式给 ROOT 组授权后可用
    _grant(db, root.id, ct, ("read",))
    content_capability_service.require_cap(db, principal, ct.id, "read")


def test_archived_type_write_rejected(db) -> None:
    ct = _type(db, status="active")
    g = _make_group(db, "cap-g5")
    _grant(db, g, ct, ("read", "create"))
    uid = _uid(db, groups=[g])
    result = agent_token_service.create_token(
        db, user_id=uid, name="t", ttl_days=30, scope_entries=[{"content_type_id": ct.id, "ops": ["read", "create"]}]
    )
    principal = AgentTokenPrincipal(token_id=result["token_id"], user_id=uid, token_name="t")
    ct.status = "archived"
    db.commit()
    with pytest.raises(ContentTypeArchived):
        content_capability_service.require_cap(db, principal, ct.id, "create")


def test_agent_principal_has_no_root_flag() -> None:
    fields = {f for f in AgentTokenPrincipal.__dataclass_fields__}
    assert fields == {"token_id", "user_id", "token_name"}, "Agent 主体不得携带 Root/系统权限标志"
    assert {f for f in UserSessionPrincipal.__dataclass_fields__} == {"user_id", "is_root"}


def test_session_principal_caps_not_limited_by_token(db) -> None:
    """浏览器会话能力不受任何 token scope 限制。"""
    ct = _type(db)
    g = _make_group(db, "cap-g6")
    _grant(db, g, ct, ("read", "create", "update"))
    uid = _uid(db, groups=[g])
    principal = UserSessionPrincipal(user_id=uid, is_root=False)
    assert content_capability_service.effective_caps(db, principal, ct.id) == {"read", "create", "update"}


def test_token_of_other_user_cannot_use(db) -> None:
    """用户 A 的 token 不能获得 B 的授权（scope 是 A 的能力子集）。"""
    ct = _type(db)
    g = _make_group(db, "cap-g7")
    _grant(db, g, ct, ("read",))
    uid_a = _uid(db, groups=[g])
    uid_b = _uid(db, groups=[])  # B 无任何组
    result = agent_token_service.create_token(
        db, user_id=uid_a, name="t", ttl_days=30, scope_entries=[{"content_type_id": ct.id, "ops": ["read"]}]
    )
    forged = AgentTokenPrincipal(token_id=result["token_id"], user_id=uid_b, token_name="t")
    with pytest.raises(ContentForbidden):
        content_capability_service.require_cap(db, forged, ct.id, "read")
