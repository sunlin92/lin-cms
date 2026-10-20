"""限流：独立应用 + 小限额验证 429。"""

from tests.conftest import make_app


def test_login_rate_limit():
    from fastapi.testclient import TestClient

    app = make_app(rate_limit_enabled=True, rate_login=3)
    with TestClient(app) as client:
        statuses = []
        for _ in range(4):
            rv = client.post("/cms/user/login", json={"username": "root", "password": "wrong"})
            statuses.append(rv.status_code)
        assert statuses[:3] == [400, 400, 400]  # 密码错误（10030）但未触发限流
        assert statuses[3] == 429
        rv = client.post("/cms/user/login", json={"username": "root", "password": "123456"})
        assert rv.status_code == 429
        assert rv.json()["code"] == 10140


def test_rate_limit_disabled_when_configured_off():
    from fastapi.testclient import TestClient

    app = make_app(rate_limit_enabled=False, rate_login=2)
    with TestClient(app) as client:
        for _ in range(5):
            rv = client.post("/cms/user/login", json={"username": "root", "password": "wrong"})
            assert rv.status_code == 400  # 密码错误，而非 429
