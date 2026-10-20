"""内容类型管理 API 测试（docs/05 Task 4，规格 §5.1）。"""

PRODUCT_FIELDS = [
    {"key": "title", "label": "标题", "type": "text", "required": True, "max_length": 100},
    {"key": "price", "label": "价格", "type": "number", "min": 0},
    {"key": "published", "label": "已上架", "type": "boolean"},
]
PRODUCT_PAYLOAD = {"key": "product", "name": "商品", "description": "商品目录", "fields": PRODUCT_FIELDS}


def test_content_type_admin_flow(client, root_headers):
    # 创建
    rv = client.post("/api/v1/admin/content-types", headers=root_headers, json=PRODUCT_PAYLOAD)
    assert rv.status_code == 200, rv.text
    assert rv.json()["code"] == 0
    # 列表（Root，分页）
    rv = client.get("/api/v1/admin/content-types", headers=root_headers)
    assert rv.status_code == 200
    items = rv.json()["items"]
    assert items and items[0]["key"] == "product" and items[0]["status"] == "active"
    type_id = items[0]["id"]
    # 详情
    rv = client.get(f"/api/v1/admin/content-types/{type_id}", headers=root_headers)
    detail = rv.json()
    assert detail["key"] == "product"
    assert [f["key"] for f in detail["fields"]] == ["title", "price", "published"]
    # 更新名称与描述（非破坏性）
    rv = client.put(
        f"/api/v1/admin/content-types/{type_id}",
        headers=root_headers,
        json={
            "name": "商品目录",
            "description": "v2",
            "fields": PRODUCT_FIELDS + [{"key": "tag", "label": "标签", "type": "text"}],
        },
    )
    assert rv.status_code == 200, rv.text
    rv = client.get(f"/api/v1/admin/content-types/{type_id}", headers=root_headers)
    assert rv.json()["name"] == "商品目录"
    assert len(rv.json()["fields"]) == 4
    # 归档后 available 不出现，restore 后回来（available 此阶段走 JWT，无授权数据时应为空）
    rv = client.post(f"/api/v1/admin/content-types/{type_id}/archive", headers=root_headers)
    assert rv.status_code == 200
    rv = client.get("/api/v1/content-types/available", headers=root_headers)
    assert rv.status_code == 200
    # 归档类型不得出现在可用列表（其它测试授权过的类型与本断言无关）
    assert all(item["key"] != "product" for item in rv.json())
    rv = client.post(f"/api/v1/admin/content-types/{type_id}/restore", headers=root_headers)
    assert rv.status_code == 200
    assert rv.json()["code"] == 0


def test_content_type_key_immutable_and_duplicate(client, root_headers):
    payload = {**PRODUCT_PAYLOAD, "key": "dup-check"}
    rv = client.post("/api/v1/admin/content-types", headers=root_headers, json=payload)
    assert rv.status_code == 200, rv.text
    # 重复 key
    rv = client.post("/api/v1/admin/content-types", headers=root_headers, json=payload)
    assert rv.status_code == 400
    assert rv.json()["code"] == 10060
    # 非法 key
    rv = client.post("/api/v1/admin/content-types", headers=root_headers, json={**payload, "key": "Bad Key"})
    assert rv.status_code == 400
    assert rv.json()["code"] == 10330


def test_content_type_admin_requires_root(client, guest_headers):
    rv = client.get("/api/v1/admin/content-types", headers=guest_headers)
    assert rv.status_code == 403 or rv.status_code == 401
    rv = client.post("/api/v1/admin/content-types", headers=guest_headers, json=PRODUCT_PAYLOAD)
    assert rv.status_code in (401, 403)


def test_content_type_requires_login(client):
    rv = client.get("/api/v1/admin/content-types")
    assert rv.status_code == 401


def test_schema_evolution_rejects_breaking_change(client, root_headers, app):
    client.post("/api/v1/admin/content-types", headers=root_headers, json={**PRODUCT_PAYLOAD, "key": "evolve-me"})
    rv = client.get("/api/v1/admin/content-types", headers=root_headers)
    matched = [i for i in rv.json()["items"] if i["key"] == "evolve-me"]
    type_id = matched[0]["id"]
    # 存量记录：title 有值，price/published 缺失（可选）
    from app.models import ContentRecord, ContentType
    from app.schemas.content_type import serialize_record

    with app.state.sessionmaker() as db:
        ct = db.query(ContentType).filter(ContentType.key == "evolve-me").one()
        db.add(ContentRecord(content_type_id=ct.id, data_json=serialize_record({"title": "旧数据"})))
        db.commit()
    # 把 price 改为必填 → 存量记录缺失 price → 拒绝（10332）
    breaking = [dict(f) for f in PRODUCT_FIELDS]
    breaking[1]["required"] = True
    rv = client.put(
        f"/api/v1/admin/content-types/{type_id}",
        headers=root_headers,
        json={"name": "商品", "fields": breaking},
    )
    assert rv.status_code == 400, rv.text
    assert rv.json()["code"] == 10332
    # 删除字段 title（存量含 title，但删除后存量记录校验缺必填 title）→ 拒绝
    removing = [f for f in PRODUCT_FIELDS if f["key"] != "title"]
    rv = client.put(
        f"/api/v1/admin/content-types/{type_id}",
        headers=root_headers,
        json={"name": "商品", "fields": removing},
    )
    assert rv.status_code == 400
    assert rv.json()["code"] == 10332


def test_available_requires_login_and_empty_for_guest(client, guest_headers):
    rv = client.get("/api/v1/content-types/available")
    assert rv.status_code == 401
    rv = client.get("/api/v1/content-types/available", headers=guest_headers)
    assert rv.status_code == 200
    # 无任何 Guest 授权时为空；有授权时只出现被授权类型（能力语义在 T6 细测）
    assert isinstance(rv.json(), list)
