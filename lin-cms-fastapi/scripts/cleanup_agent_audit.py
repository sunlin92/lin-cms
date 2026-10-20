"""Agent 审计保留期清理维护脚本（docs/04 §3.5：显式维护命令，不引入后台队列）。

用法：uv run python scripts/cleanup_agent_audit.py
退出码 0 表示成功；打印清理行数。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.exc import OperationalError

from app.core.config import get_settings
from app.db.session import build_engine, build_sessionmaker
from app.services import agent_audit_service


def main() -> int:
    settings = get_settings()
    engine = build_engine(settings.database_url)
    sessionmaker = build_sessionmaker(engine)
    try:
        with sessionmaker() as db:
            removed = agent_audit_service.cleanup_expired(db, retention_days=settings.agent_audit_retention_days)
            db.commit()
    except OperationalError:
        print("数据库尚未迁移到包含 lin_agent_audit_log 的版本，请先执行 alembic upgrade head")
        return 1
    print(f"cleaned {removed} expired agent audit rows (retention={settings.agent_audit_retention_days}d)")
    engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
