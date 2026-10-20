"""日志查询、图书、文件上传服务。文件存储以策略接口隔离（默认本地磁盘）。"""

import hashlib
import os
import time
import uuid
from dataclasses import dataclass
from typing import Protocol

from fastapi import Request, UploadFile
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import (
    BOOK_CREATED,
    BOOK_DELETED,
    BOOK_UPDATED,
    FileExtensionError,
    FileTooLarge,
    FileTooMany,
    NotFound,
    ParameterError,
)
from app.models import Book
from app.repositories import content_repo
from app.schemas.content import BookIn, LogQueryIn
from app.services.auth_service import avatar_url


def page_logs(db: Session, query: LogQueryIn, *, keyword: str | None = None) -> dict:
    total, items = content_repo.page_logs(
        db,
        count=query.count,
        page=query.page,
        keyword=keyword,
        name=query.name,
        start=query.start,
        end=query.end,
    )
    total_page = (total + query.count - 1) // query.count if total else 0
    return {
        "items": [_log_out(item) for item in items],
        "count": query.count,
        "page": query.page,
        "total": total,
        "total_page": total_page,
    }


def _log_out(item) -> dict:
    return {
        "id": item.id,
        "message": item.message,
        "user_id": item.user_id,
        "username": item.username,
        "status_code": item.status_code,
        "method": item.method,
        "path": item.path,
        "permission": item.permission,
        "time": item.create_time.strftime("%Y-%m-%dT%H:%M:%SZ") if item.create_time else None,
    }


def logged_usernames(db: Session) -> dict:
    return {"items": content_repo.logged_usernames(db)}


# ---------- 图书 ----------


def list_books_payload(db: Session) -> list[dict]:
    return [_book_out(b) for b in content_repo.list_books(db)]


def get_book_payload(db: Session, book_id: int) -> dict:
    book = content_repo.get_book(db, book_id)
    if book is None:
        raise NotFound("书籍不存在")
    return _book_out(book)


def search_books_payload(db: Session, q: str) -> list[dict]:
    return [_book_out(b) for b in content_repo.search_books(db, q)]


def create_book(db: Session, payload: BookIn) -> int:
    db.add(Book(title=payload.title, author=payload.author, summary=payload.summary, image=payload.image))
    db.flush()
    return BOOK_CREATED


def update_book(db: Session, book_id: int, payload: BookIn) -> int:
    book = content_repo.get_book(db, book_id)
    if book is None:
        raise NotFound("书籍不存在")
    book.title = payload.title
    book.author = payload.author
    book.summary = payload.summary
    book.image = payload.image
    db.flush()
    return BOOK_UPDATED


def delete_book(db: Session, book_id: int) -> int:
    book = content_repo.get_book(db, book_id)
    if book is None:
        raise NotFound("书籍不存在")
    book.soft_delete()
    db.flush()
    return BOOK_DELETED


def _book_out(book: Book) -> dict:
    return {"id": book.id, "title": book.title, "author": book.author, "image": book.image, "summary": book.summary}


# ---------- 文件上传（策略模式） ----------


@dataclass(frozen=True)
class StoredFile:
    key: str
    id: int
    path: str
    url: str


class StorageBackend(Protocol):
    def save(self, filename: str, data: bytes) -> str: ...  # 返回相对路径


class LocalStorage:
    def __init__(self, root: str) -> None:
        self._root = root

    def save(self, filename: str, data: bytes) -> str:
        day_dir = time.strftime("%Y/%m/%d")
        rel_path = f"{day_dir}/{uuid.uuid1().hex}{os.path.splitext(filename)[1].lower()}"
        abs_dir = os.path.join(self._root, day_dir)
        os.makedirs(abs_dir, exist_ok=True)
        with open(os.path.join(self._root, rel_path), "wb") as fh:
            fh.write(data)
        return rel_path


def _ext(filename: str) -> str:
    return os.path.splitext(filename)[1].lstrip(".").lower()


def _validate_uploads(settings: Settings, files: list[tuple[str, UploadFile, bytes]]) -> None:
    if not files:
        raise ParameterError("未找到符合条件的文件资源")
    allowed = {ext.lower() for ext in settings.upload_extensions}
    for _, upload, data in files:
        ext = _ext(upload.filename or "")
        if ext not in allowed:
            raise FileExtensionError()
        if len(data) > settings.upload_single_limit:
            raise FileTooLarge()
    if len(files) > 1:
        if len(files) > settings.upload_max_files:
            raise FileTooMany()
        if sum(len(data) for *_, data in files) > settings.upload_total_limit:
            raise FileTooLarge()


def upload_files(
    db: Session, settings: Settings, request: Request, files: list[tuple[str, UploadFile]]
) -> list[StoredFile]:
    payloads = [(key, upload, upload.file.read()) for key, upload in files]
    _validate_uploads(settings, payloads)
    storage = LocalStorage(settings.upload_dir)
    results: list[StoredFile] = []
    for key, upload, data in payloads:
        md5 = hashlib.md5(data).hexdigest()
        existing = content_repo.find_file_by_md5(db, md5)
        if existing is not None:
            rel_path = existing.path
            record_id = existing.id
        else:
            rel_path = storage.save(upload.filename or "file", data)
            record = content_repo.create_file_record(
                db,
                name=os.path.basename(rel_path),
                path=rel_path,
                extension="." + _ext(upload.filename or ""),
                size=len(data),
                md5=md5,
            )
            record_id = record.id
        url = avatar_url(settings, request, rel_path)
        results.append(StoredFile(key=key, id=record_id, path=rel_path, url=url or ""))
    return results
