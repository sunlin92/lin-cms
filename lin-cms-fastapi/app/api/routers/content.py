"""日志（挂载权限）、文件上传、图书路由。"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile as RawUploadFile

from app.api.deps import get_current_user, require_permission
from app.core.config import Settings
from app.core.errors import success_envelope
from app.core.permissions import BOOK_DELETE, LOG_SEARCH, LOG_USERS, LOG_VIEW
from app.db.session import get_db
from app.models import User
from app.schemas.content import BookIn, BookOut, LogPageOut, LogQueryIn, UsernameListOut
from app.services import content_service

# 模块级权限依赖单例（避免 B008：默认参数中函数调用）
require_log_view = require_permission(LOG_VIEW)
require_log_search = require_permission(LOG_SEARCH)
require_log_users = require_permission(LOG_USERS)
require_book_delete = require_permission(BOOK_DELETE)

log_router = APIRouter(prefix="/cms/log", tags=["日志"])


@log_router.get("", response_model=LogPageOut)
def list_logs(
    query: Annotated[LogQueryIn, Query()],
    db: Session = Depends(get_db),
    _user: User = Depends(require_log_view),
) -> LogPageOut:
    return LogPageOut(**content_service.page_logs(db, query))


@log_router.get("/search", response_model=LogPageOut)
def search_logs(
    query: Annotated[LogQueryIn, Query()],
    db: Session = Depends(get_db),
    _user: User = Depends(require_log_search),
) -> LogPageOut:
    return LogPageOut(**content_service.page_logs(db, query, keyword=query.keyword))


@log_router.get("/users", response_model=UsernameListOut)
def logged_users(
    db: Session = Depends(get_db),
    _user: User = Depends(require_log_users),
) -> UsernameListOut:
    return UsernameListOut(**content_service.logged_usernames(db))


file_router = APIRouter(prefix="/cms/file", tags=["文件"])


@file_router.post("")
async def upload_files(
    request: Request,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[dict]:
    settings: Settings = request.app.state.settings
    form = await request.form()
    collected = [(key, value) for key, value in form.multi_items() if isinstance(value, RawUploadFile)]
    stored = content_service.upload_files(db, settings, request, collected)
    return [item.__dict__ for item in stored]


book_router = APIRouter(prefix="/v1/book", tags=["图书"])


@book_router.get("", response_model=list[BookOut])
def list_books(db: Session = Depends(get_db)) -> list[BookOut]:
    return [BookOut(**item) for item in content_service.list_books_payload(db)]


@book_router.get("/search", response_model=list[BookOut])
def search_books(q: str = "", db: Session = Depends(get_db)) -> list[BookOut]:
    return [BookOut(**item) for item in content_service.search_books_payload(db, q)]


@book_router.get("/{book_id}", response_model=BookOut)
def get_book(book_id: int, db: Session = Depends(get_db)) -> BookOut:
    return BookOut(**content_service.get_book_payload(db, book_id))


@book_router.post("")
def create_book(
    payload: BookIn,
    request: Request,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> dict:
    code = content_service.create_book(db, payload)
    return success_envelope(request, code=code, message="新建图书成功")


@book_router.put("/{book_id}")
def update_book(
    book_id: int,
    payload: BookIn,
    request: Request,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> dict:
    code = content_service.update_book(db, book_id, payload)
    return success_envelope(request, code=code, message="更新图书成功")


@book_router.delete("/{book_id}")
def delete_book(
    book_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _user: User = Depends(require_book_delete),
) -> dict:
    code = content_service.delete_book(db, book_id)
    return success_envelope(request, code=code, message="删除图书成功")
