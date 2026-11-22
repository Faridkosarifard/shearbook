def test_service_crud(auth_client, csrf_headers, bot_headers):
    listed = auth_client.get("/api/services")
    assert listed.status_code == 200
    assert any(s["name"] == "Men's haircut" for s in listed.get_json())

    created = auth_client.post(
        "/api/services", json={"name": "Beard trim", "duration": 20}, headers=csrf_headers
    )
    assert created.status_code == 201
    service_id = created.get_json()["service"]["id"]

    updated = auth_client.put(
        f"/api/services/{service_id}",
        json={"name": "Beard trim", "duration": 25},
        headers=csrf_headers,
    )
    assert updated.get_json()["service"]["duration"] == 25

    auth_client.post(
        f"/api/services/{service_id}/reorder", json={"direction": "up"}, headers=csrf_headers
    )
    deleted = auth_client.delete(f"/api/services/{service_id}", headers=csrf_headers)
    assert deleted.status_code == 200

    # bot can read, not write
    assert (
        auth_client.application.test_client().get("/api/services", headers=bot_headers).status_code
        == 200
    )
    no_csrf = auth_client.post("/api/services", json={"name": "X", "duration": 10})
    assert no_csrf.status_code == 403
