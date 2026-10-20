"""日志、文件、图书仓储。"""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Book, FileRecord, Log

# ---------- 日志 ----------


def create_log(
    db: Session,
    *,
    message: str,
    user_id: int,
    username: str,
    status_code: int,
    method: str,
    path: str,
    permission: str = "",
) -> None:
    db.add(
        Log(
            message=message,
            user_id=user_id,
            username=username,
            status_code=status_code,
            method=method,
            path=path,
            permission=permission,
        )
    )
    db.flush()


def _parse(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")


def page_logs(
    db: Session,
    *,
    count: int,
    page: int,
    keyword: str | None = None,
    name: str | None = None,
    start: str | None = None,
    end: str | None = None,
) -> tuple[int, list[Log]]:
    stmt = select(Log)
    if keyword:
        stmt = stmt.where(Log.message.contains(keyword, autoescape=True))
    if name:
        stmt = stmt.where(Log.username == name)
    if start and end:
        stmt = stmt.where(Log.create_time.between(_parse(start), _parse(end)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = list(db.scalars(stmt.order_by(Log.create_time.desc()).offset(count * page).limit(count)))
    return total, items


def logged_usernames(db: Session) -> list[str]:
    rows = db.execute(select(Log.username).group_by(Log.username)).all()
    return [row[0] for row in rows if row[0]]


# ---------- 文件 ----------


def find_file_by_md5(db: Session, md5: str) -> FileRecord | None:
    return db.scalar(select(FileRecord).where(FileRecord.md5 == md5, FileRecord.deleted_token == 0))


def create_file_record(db: Session, *, name: str, path: str, extension: str, size: int, md5: str) -> FileRecord:
    record = FileRecord(name=name, path=path, extension=extension, size=size, md5=md5)
    db.add(record)
    db.flush()
    return record


# ---------- 图书 ----------


def list_books(db: Session) -> list[Book]:
    return list(db.scalars(select(Book).where(Book.deleted_token == 0).order_by(Book.id)))


def get_book(db: Session, book_id: int) -> Book | None:
    return db.scalar(select(Book).where(Book.id == book_id, Book.deleted_token == 0))


def search_books(db: Session, q: str) -> list[Book]:
    stmt = select(Book).where(Book.deleted_token == 0, Book.title.contains(q, autoescape=True))
    return list(db.scalars(stmt.order_by(Book.id)))
