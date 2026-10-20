"""权限同步：注册表与数据库一致、幂等、包含关键声明。"""

from app.core.permissions import PERMISSION_REGISTRY
from app.models import Permission


def test_all_declared_permissions_synced_to_db(app):
    with app.state.sessionmaker() as db:
        db_rows = {(p.name, p.module, p.mount) for p in db.query(Permission).all()}
    code_metas = {(m.name, m.module, m.mount) for m in PERMISSION_REGISTRY}
    assert db_rows == code_metas
    assert len(code_metas) == 24


def test_decorator_order_victims_present(app):
    with app.state.sessionmaker() as db:
        rows = {(p.name, p.module, p.mount) for p in db.query(Permission).all()}
    assert ("注册", "用户", False) in rows
    assert ("刷新令牌", "用户", False) in rows
    assert ("查询日志", "日志", True) in rows
    assert ("删除图书", "图书", True) in rows


def test_sync_is_idempotent(app):
    from app.core.permissions import sync_permissions

    with app.state.sessionmaker() as db:
        sync_permissions(db)
        db.commit()
        rows = [(p.name, p.module) for p in db.query(Permission).all()]
    assert len(rows) == len(set(rows))
