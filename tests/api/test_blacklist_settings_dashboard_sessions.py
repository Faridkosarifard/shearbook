def test_blacklist_crud(auth_client, csrf_headers, bot_headers):
    added = auth_client.post("/api/blacklist", json={"phone": "+49 170 555"}, headers=csrf_headers)
    assert added.status_code == 201
    again = auth_client.post("/api/blacklist", json={"phone": "49170555"}, headers=csrf_headers)
    assert again.status_code == 400
    listed = auth_client.get("/api/blacklist")
    assert any(row["phone"] == "49170555" for row in listed.get_json())
    check = auth_client.get("/api/blacklist/49170555", headers=bot_headers)
    assert check.get_json()["blacklisted"] is True
    deleted = auth_client.delete("/api/blacklist/49170555", headers=csrf_headers)
    assert deleted.status_code == 200


def test_settings_roundtrip(auth_client, csrf_headers, bot_headers):
    current = auth_client.get("/api/settings", headers=bot_headers)
    assert current.status_code == 200
    assert current.get_json()["salon_name"] == "Your Salon"
    updated = auth_client.put(
        "/api/settings",
        json={"salon_name": "Harbour Cuts", "days_off": "Sunday,Monday"},
        headers=csrf_headers,
    )
    assert updated.status_code == 200
    one = auth_client.get("/api/settings/salon_name")
    assert one.get_json()["value"] == "Harbour Cuts"
    auth_client.post("/api/settings/theme_color", json={"value": "#123456"}, headers=csrf_headers)
    assert auth_client.get("/api/settings/theme_color").get_json()["value"] == "#123456"
    auth_client.delete("/api/settings/theme_color", headers=csrf_headers)
    assert auth_client.get("/api/settings/theme_color").status_code == 404


def test_dashboard_and_tomorrow(auth_client, csrf_headers, stylist, bot_headers):
    overview = auth_client.get("/api/dashboard")
    assert overview.status_code == 200
    body = overview.get_json()
    assert "week_count" in body
    assert "today" in body
    msg = auth_client.get("/api/appointments/tomorrow/message", headers=bot_headers)
    assert msg.status_code == 200
    assert "message" in msg.get_json()
    assert auth_client.get("/api/appointments/tomorrow/message").status_code == 401


def test_sessions(client, bot_headers):
    empty = client.get("/api/session/chat-1", headers=bot_headers)
    assert empty.get_json() == {"step": None, "code": None, "data": {}}
    saved = client.post(
        "/api/session/chat-1",
        json={"step": "choose_service", "data": {"service_id": 1}},
        headers=bot_headers,
    )
    assert saved.status_code == 200
    loaded = client.get("/api/session/chat-1", headers=bot_headers)
    assert loaded.get_json()["step"] == "choose_service"
    assert loaded.get_json()["data"]["service_id"] == 1
    client.delete("/api/session/chat-1", headers=bot_headers)
    gone = client.get("/api/session/chat-1", headers=bot_headers)
    assert gone.get_json()["step"] is None
    assert client.get("/api/session/chat-1").status_code == 401


def test_list_sessions_admin(client, auth_client, bot_headers):
    client.post(
        "/api/session/49111111111@c.us",
        json={"step": "choose_service", "data": {}},
        headers=bot_headers,
    )
    listed = auth_client.get("/api/sessions")
    assert listed.status_code == 200
    body = listed.get_json()
    assert any(row["phone"] == "49111111111" and row["step"] == "choose_service" for row in body)
    assert client.get("/api/sessions").status_code == 401


def test_whatsapp_proxy_requires_admin(client):
    response = client.get("/wa/status")
    assert response.status_code == 401
