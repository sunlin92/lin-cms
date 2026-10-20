"""内容记录数据访问：分页查询与 keyset 批量扫描（无界扫描禁止）。"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ContentRecord

BATCH_SIZE = 200


def page_alive_records(
    db: Session, content_type_id: int, *, offset: int, limit: int
) -> tuple[list[ContentRecord], int]:
    """常规分页（无过滤/排序路径）：id 倒序。"""
    base = select(ContentRecord).where(
        ContentRecord.content_type_id == content_type_id, ContentRecord.deleted_token == 0
    )
    total = int(db.scalar(select(func.count()).select_from(base.subquery())) or 0)
    rows = list(db.scalars(base.order_by(ContentRecord.id.desc()).offset(offset).limit(limit)))
    return rows, total


def scan_alive_records(
    db: Session, content_type_id: int, *, max_rows: int, batch_size: int = BATCH_SIZE
) -> tuple[list[ContentRecord], bool]:
    """按 id 倒序 keyset 分批拉取活跃记录，最多 max_rows 行。

    返回 (记录列表, 是否被截断)。截断=True 表示已到扫描上限仍未取完——调用方必须
    向外报告 scan_truncated，不得把窗口内计数当作全量 total。
    """
    collected: list[ContentRecord] = []
    cursor: int | None = None
    truncated = False
    while len(collected) < max_rows:
        limit = min(batch_size, max_rows - len(collected))
        query = (
            select(ContentRecord)
            .where(ContentRecord.content_type_id == content_type_id, ContentRecord.deleted_token == 0)
            .order_by(ContentRecord.id.desc())
            .limit(limit)
        )
        if cursor is not None:
            query = query.where(ContentRecord.id < cursor)
        batch = list(db.scalars(query))
        if not batch:
            break
        collected.extend(batch)
        cursor = batch[-1].id
        if len(batch) < limit:
            break
    else:
        truncated = True
    return collected, truncated
