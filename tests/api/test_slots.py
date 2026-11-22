def test_slots_require_auth(client):
    resp = client.post("/api/slots", json={"date": "2026-03-03", "duration": 30})
    assert resp.status_code == 401


def test_slots_for_stylist(auth_client, stylist):
    resp = auth_client.post(
        "/api/slots", json={"date": "2026-03-03", "duration": 30, "stylist_id": stylist["id"]}
    )
    body = resp.get_json()
    assert body["reason"] == "ok"
    assert "09:00" in body["slots"]
    assert "16:30" in body["slots"]
    assert "17:00" not in body["slots"]

    holiday = auth_client.post(
        "/api/slots", json={"date": "2026-04-06", "duration": 30, "stylist_id": stylist["id"]}
    )
    assert holiday.get_json()["reason"] == "public_holiday"


def test_invalid_payload(auth_client):
    assert auth_client.post("/api/slots", json={"date": "", "duration": 30}).status_code == 400
    assert (
        auth_client.post("/api/slots", json={"date": "2026-03-03", "duration": 0}).status_code
        == 400
    )
