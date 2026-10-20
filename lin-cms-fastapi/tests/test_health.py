"""存活探针。"""


def test_health_ok(client):
    rv = client.get("/health")
    assert rv.status_code == 200
    data = rv.json()
    assert data["status"] == "ok"
    assert data["version"]
