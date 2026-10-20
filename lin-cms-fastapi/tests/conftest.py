"""共享测试固件。

- 主套件使用内存 SQLite + 限流关闭；限流/上传限额用例通过 make_app(**overrides) 构造独立应用。
- 种子：Root/Guest 分组、root 用户、tester（Guest）、一本图书。
"""

import os

os.environ.setdefault("LIN_ENV", "test")
os.environ.setdefault("LIN_SECRET_KEY", "test-secret-key-for-ci")
os.environ.setdefault("LIN_DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("LIN_RATE_LIMIT_ENABLED", "false")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import create_settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import Book, Group  # noqa: E402
from app.repositories import user_repo  # noqa: E402

ROOT_USERNAME = "root"
ROOT_PASSWORD = "123456"
GUEST_USERNAME = "tester"
GUEST_PASSWORD = "123456x"

BOOK_PAYLOAD = {
    "title": "测试驱动开发",
    "author": "Kent Beck",
    "summary": "测试驱动开发的实践指南",
    "image": "https://img3.doubanio.com/lpic/s1470003.jpg",
}


def make_app(**overrides):
    settings = create_settings()
    for key, value in overrides.items():
        setattr(settings, key, value)
    return create_app(settings)


def seed_extras(app) -> None:
    with app.state.sessionmaker() as db:
        guest = db.query(Group).filter(Group.level == 2, Group.deleted_token == 0).first()
        tester = user_repo.create_user(db, username=GUEST_USERNAME)
        user_repo.set_password(db, tester, GUEST_PASSWORD)
        from app.models import UserGroup

        db.add(UserGroup(user_id=tester.id, group_id=guest.id))
        db.add(Book(**BOOK_PAYLOAD))
        db.commit()


@pytest.fixture(scope="session")
def app():
    application = make_app()
    with TestClient(application) as _client:  # 触发 lifespan：建表 + 种子 + 权限同步
        seed_extras(application)
    return application


@pytest.fixture()
def client(app):
    with TestClient(app) as test_client:
        yield test_client


def login(client, username: str, password: str) -> dict:
    rv = client.post("/cms/user/login", json={"username": username, "password": password})
    assert rv.status_code == 200, rv.text
    data = rv.json()
    assert data.get("access_token") and data.get("refresh_token")
    return data


@pytest.fixture()
def root_auth(app):
    with TestClient(app) as client:
        return login(client, ROOT_USERNAME, ROOT_PASSWORD)


@pytest.fixture()
def guest_auth(app):
    with TestClient(app) as client:
        return login(client, GUEST_USERNAME, GUEST_PASSWORD)


@pytest.fixture()
def root_headers(root_auth):
    return {"Authorization": "Bearer " + root_auth["access_token"]}


@pytest.fixture()
def guest_headers(guest_auth):
    return {"Authorization": "Bearer " + guest_auth["access_token"]}


def find_user_id(client, headers, username: str) -> int:
    page = 0
    while True:
        rv = client.get("/cms/admin/users", headers=headers, params={"count": 15, "page": page})
        assert rv.status_code == 200
        items = rv.json()["items"]
        if not items:
            break
        for item in items:
            if item["username"] == username:
                return item["id"]
        page += 1
    raise AssertionError(f"user {username} not found")


def permission_ids_by_module(client, headers, module: str) -> list[int]:
    rv = client.get("/cms/admin/permission", headers=headers)
    assert rv.status_code == 200
    return [p["id"] for p in rv.json().get(module, [])]
