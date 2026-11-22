def _first_service(auth_client):
    return auth_client.get("/api/services").get_json()[0]


def test_create_list_update_cancel(auth_client, csrf_headers, stylist, bot_headers):
    service = _first_service(auth_client)
    # 3 March 2026 is a Tuesday
    created = auth_client.post(
        "/api/appointments",
        json={
            "name": "Jamie Doe",
            "phone": "+49 170 0000001",
            "service_id": service["id"],
            "stylist_id": stylist["id"],
            "start": "2026-03-03T10:00:00",
        },
        headers=csrf_headers,
    )
    assert created.status_code == 200, created.get_data(as_text=True)
    code = created.get_json()["reservation_code"]
    assert code.startswith("SB-0303-")

    listed = auth_client.get("/api/appointments?from=2026-03-03&to=2026-03-03")
    assert len(listed.get_json()) == 1

    # conflict
    clash = auth_client.post(
        "/api/appointments",
        json={
            "name": "Other",
            "phone": "491700000002",
            "service_id": service["id"],
            "stylist_id": stylist["id"],
            "start": "2026-03-03T10:00:00",
        },
        headers=csrf_headers,
    )
    assert clash.status_code == 409

    fetched = auth_client.get(f"/api/appointments/{code}")
    assert fetched.status_code == 200
    public_denied = auth_client.application.test_client().get(f"/api/appointments/{code}")
    assert public_denied.status_code == 403
    public_ok = auth_client.application.test_client().get(
        f"/api/appointments/{code}?phone=491700000001"
    )
    assert public_ok.status_code == 200

    moved = auth_client.put(
        f"/api/appointments/{code}",
        json={"new_date": "2026-03-03", "new_time": "15:00"},
        headers=csrf_headers,
    )
    assert moved.status_code == 200
    assert moved.get_json()["appointment"]["time"] == "15:00"

    cancelled = auth_client.delete(f"/api/appointments/{code}", headers=csrf_headers)
    assert cancelled.status_code == 200
    assert auth_client.get(f"/api/appointments/{code}").status_code == 404


def test_blacklist_blocks_booking(auth_client, csrf_headers, stylist):
    auth_client.post("/api/blacklist", json={"phone": "491700009999"}, headers=csrf_headers)
    service = _first_service(auth_client)
    resp = auth_client.post(
        "/api/appointments",
        json={
            "name": "Blocked",
            "phone": "491700009999",
            "service_id": service["id"],
            "stylist_id": stylist["id"],
            "start": "2026-03-03T11:00:00",
        },
        headers=csrf_headers,
    )
    assert resp.status_code == 403


def test_bot_can_book(client, bot_headers, stylist, app, auth_client):
    service = auth_client.get("/api/services").get_json()[0]
    resp = client.post(
        "/api/appointments",
        json={
            "name": "Bot Customer",
            "phone": "491700001111",
            "service_id": service["id"],
            "stylist_id": stylist["id"],
            "start": "2026-03-04T09:30:00",
        },
        headers=bot_headers,
    )
    assert resp.status_code == 200
    assert resp.get_json()["reservation_code"]


def test_reschedule_endpoint(auth_client, csrf_headers, stylist):
    service = _first_service(auth_client)
    created = auth_client.post(
        "/api/appointments",
        json={
            "name": "Riley",
            "phone": "491700002222",
            "service_id": service["id"],
            "stylist_id": stylist["id"],
            "start": "2026-03-05T09:00:00",
        },
        headers=csrf_headers,
    )
    appt_id = created.get_json()["appointment"]["id"]
    moved = auth_client.post(
        f"/api/appointments/{appt_id}/reschedule",
        json={"new_date": "2026-03-05", "new_time": "16:00"},
        headers=csrf_headers,
    )
    assert moved.status_code == 200
    assert moved.get_json()["appointment"]["time"] == "16:00"
