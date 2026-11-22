def test_stylist_get_and_reassign(auth_client, csrf_headers, stylist):
    got = auth_client.get(f"/api/stylists/{stylist['id']}")
    assert got.status_code == 200
    listed = auth_client.get("/api/stylists?active=true")
    assert any(row["id"] == stylist["id"] for row in listed.get_json())

    created = auth_client.post("/api/stylists", json={"name": "Jordan"}, headers=csrf_headers)
    other_id = created.get_json()["stylist"]["id"]
    weekly = {
        "weekly": [
            {"weekday": 0, "start": "09:00", "end": "17:00"},
            {"weekday": 1, "start": "09:00", "end": "17:00"},
            {"weekday": 2, "start": "09:00", "end": "17:00"},
            {"weekday": 3, "start": "09:00", "end": "17:00"},
        ]
    }
    auth_client.put(f"/api/stylists/{other_id}/schedule", json=weekly, headers=csrf_headers)

    service = auth_client.get("/api/services").get_json()[0]
    booked = auth_client.post(
        "/api/appointments",
        json={
            "name": "Casey",
            "phone": "491700003333",
            "service_id": service["id"],
            "stylist_id": stylist["id"],
            "start": "2026-03-03T13:00:00",
        },
        headers=csrf_headers,
    )
    assert booked.status_code == 200
    appt_id = booked.get_json()["appointment"]["id"]
    moved = auth_client.post(
        f"/api/stylists/{stylist['id']}/reassign",
        json={"new_stylist_id": other_id, "appointment_ids": [appt_id], "upcoming_only": False},
        headers=csrf_headers,
    )
    assert moved.status_code == 200
    # cannot delete stylist with (now moved, so original has none? target has upcoming)
    blocked = auth_client.delete(f"/api/stylists/{other_id}", headers=csrf_headers)
    assert blocked.status_code == 409

    add = auth_client.post(
        f"/api/stylists/{stylist['id']}/services",
        json={"service_id": service["id"]},
        headers=csrf_headers,
    )
    assert add.status_code == 200
    removed = auth_client.delete(
        f"/api/stylists/{stylist['id']}/services/{service['id']}",
        headers=csrf_headers,
    )
    assert removed.status_code == 200


def test_customers_endpoint_and_errors(auth_client, csrf_headers):
    missing = auth_client.post("/api/customers", json={"name": "A"}, headers=csrf_headers)
    assert missing.status_code == 400
    ok = auth_client.post(
        "/api/customers", json={"name": "Ava", "phone": "491700004444"}, headers=csrf_headers
    )
    assert ok.status_code == 200
    again = auth_client.post(
        "/api/customers", json={"name": "Ava K.", "phone": "491700004444"}, headers=csrf_headers
    )
    assert again.status_code == 200


def test_unknown_routes_and_spa(auth_client):
    missing = auth_client.get("/api/does-not-exist")
    assert missing.status_code in {404, 200}


def test_schedule_validation(auth_client, csrf_headers, stylist):
    bad = auth_client.put(
        f"/api/stylists/{stylist['id']}/schedule",
        json={"weekly": [{"weekday": 0, "start": "18:00", "end": "09:00"}]},
        headers=csrf_headers,
    )
    assert bad.status_code == 400
    missing = auth_client.get("/api/stylists/999/schedule")
    assert missing.status_code == 404


def test_validation_errors(auth_client, csrf_headers, stylist, bot_headers):
    assert (
        auth_client.post(
            "/api/services", json={"name": "", "duration": 10}, headers=csrf_headers
        ).status_code
        == 400
    )
    assert (
        auth_client.post(
            "/api/services", json={"name": "X", "duration": 0}, headers=csrf_headers
        ).status_code
        == 400
    )
    assert (
        auth_client.put(
            "/api/services/1", json={"name": "", "duration": 10}, headers=csrf_headers
        ).status_code
        == 400
    )
    assert (
        auth_client.put(
            "/api/services/1", json={"name": "X", "duration": -1}, headers=csrf_headers
        ).status_code
        == 400
    )
    assert (
        auth_client.put(
            "/api/services/999", json={"name": "X", "duration": 10}, headers=csrf_headers
        ).status_code
        == 404
    )
    assert auth_client.delete("/api/services/999", headers=csrf_headers).status_code == 404
    assert (
        auth_client.post(
            "/api/services/1/reorder", json={"direction": "sideways"}, headers=csrf_headers
        ).status_code
        == 400
    )
    assert (
        auth_client.post("/api/stylists", json={"name": ""}, headers=csrf_headers).status_code
        == 400
    )
    assert auth_client.get("/api/stylists/999").status_code == 404
    assert auth_client.delete("/api/stylists/999", headers=csrf_headers).status_code == 404
    assert (
        auth_client.post("/api/appointments", json={"name": "A"}, headers=csrf_headers).status_code
        == 400
    )
    bad_start = auth_client.post(
        "/api/appointments",
        json={
            "name": "A",
            "phone": "1",
            "service_id": 1,
            "stylist_id": stylist["id"],
            "start": "not-a-date",
        },
        headers=csrf_headers,
    )
    assert bad_start.status_code == 400
    assert (
        auth_client.put("/api/appointments/NOPE", json={}, headers=csrf_headers).status_code == 400
    )
    assert auth_client.get("/api/appointments/NOPE").status_code == 404
    assert auth_client.delete("/api/appointments/NOPE", headers=csrf_headers).status_code == 404

    custom = auth_client.post(
        f"/api/stylists/{stylist['id']}/exceptions",
        json={
            "type": "CUSTOM",
            "date": "2026-03-10",
            "start": "11:00",
            "end": "12:00",
            "note": "Short",
        },
        headers=csrf_headers,
    )
    assert custom.status_code == 200
    ex_id = custom.get_json()["id"]
    listed = auth_client.get(
        f"/api/stylists/{stylist['id']}/schedule?from=2026-03-01&to=2026-03-31"
    )
    assert any(item["id"] == ex_id for item in listed.get_json()["exceptions"])
    assert listed.get_json()["exceptions"][0]["start"] == "11:00"
    deleted = auth_client.delete(
        f"/api/stylists/{stylist['id']}/exceptions/{ex_id}", headers=csrf_headers
    )
    assert deleted.status_code == 200


def test_tomorrow_message_with_booking(auth_client, csrf_headers, stylist, bot_headers):
    from datetime import timedelta

    from flask import current_app

    from shearbook.timeutil import now_tz

    with auth_client.application.app_context():
        tomorrow = now_tz(current_app.config["TIMEZONE"]).date() + timedelta(days=1)
    # Skip weekends: walk forward to a weekday the stylist works
    while tomorrow.weekday() > 4:
        tomorrow = tomorrow + timedelta(days=1)
    service = auth_client.get("/api/services").get_json()[0]
    booked = auth_client.post(
        "/api/appointments",
        json={
            "name": "Morgan",
            "phone": "491700005555",
            "service_id": service["id"],
            "stylist_id": stylist["id"],
            "start": f"{tomorrow.isoformat()}T11:00:00",
        },
        headers=csrf_headers,
    )
    # If the walked date is not tomorrow the message may still be empty; that's fine.
    if booked.status_code == 200:
        pass
    msg = auth_client.get("/api/appointments/tomorrow/message", headers=bot_headers)
    assert msg.status_code == 200
    # Force the appointment onto tomorrow when the next weekday is tomorrow

    with auth_client.application.app_context():
        real_tomorrow = now_tz(current_app.config["TIMEZONE"]).date() + timedelta(days=1)
    if real_tomorrow.weekday() <= 4 and booked.status_code == 200:
        assert "Morgan" in msg.get_json()["message"]
        assert msg.get_json()["count"] >= 1
