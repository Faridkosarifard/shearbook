def test_login_logout_and_csrf(client):
    bad = client.post("/api/auth/login", json={"username": "admin", "password": "wrong-password"})
    assert bad.status_code == 401
    missing = client.post("/api/auth/login", json={"username": "admin"})
    assert missing.status_code == 400
    csrf = client.get("/api/auth/csrf")
    assert csrf.status_code == 401
    ok = client.post("/api/auth/login", json={"username": "admin", "password": "password123"})
    assert ok.status_code == 200
    assert ok.get_json()["username"] == "admin"
    assert client.get_cookie("admin_token")
    assert client.get_cookie("csrf_token")
    refreshed = client.get("/api/auth/csrf")
    assert refreshed.status_code == 200
    out = client.post("/api/auth/logout")
    assert out.status_code == 200


def test_health_is_public(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "ok"


def test_session_is_public_and_reports_auth_state(client):
    before = client.get("/api/auth/session")
    assert before.status_code == 200
    assert before.get_json() == {"status": "ok", "authenticated": False}
    assert client.get_cookie("csrf_token") is None

    login = client.post("/api/auth/login", json={"username": "admin", "password": "password123"})
    assert login.status_code == 200

    after = client.get("/api/auth/session")
    assert after.status_code == 200
    body = after.get_json()
    assert body["authenticated"] is True
    assert body["username"] == "admin"
    assert client.get_cookie("csrf_token")
