def test_stylist_schedule_and_assignment(auth_client, csrf_headers, bot_headers):
    created = auth_client.post("/api/stylists", json={"name": "Sam"}, headers=csrf_headers)
    assert created.status_code == 201
    stylist = created.get_json()["stylist"]
    assert stylist["calendar_id"].startswith("local-")
    sid = stylist["id"]

    weekly = {
        "weekly": [
            {"weekday": 0, "start": "09:00", "end": "13:00"},
            {"weekday": 0, "start": "14:00", "end": "18:00"},
        ]
    }
    assert (
        auth_client.put(
            f"/api/stylists/{sid}/schedule", json=weekly, headers=csrf_headers
        ).status_code
        == 200
    )
    sched = auth_client.get(f"/api/stylists/{sid}/schedule")
    assert len(sched.get_json()["weekly"]) == 2

    ex = auth_client.post(
        f"/api/stylists/{sid}/exceptions",
        json={"type": "OFF", "date": "2026-03-16", "note": "Vacation"},
        headers=csrf_headers,
    )
    assert ex.status_code == 200
    bulk = auth_client.post(
        f"/api/stylists/{sid}/exceptions/bulk-off",
        json={"start_date": "2026-03-17", "end_date": "2026-03-18"},
        headers=csrf_headers,
    )
    assert bulk.get_json()["created"] == 2

    services = auth_client.get("/api/services").get_json()
    ids = [s["id"] for s in services[:2]]
    assign = auth_client.put(
        f"/api/stylists/{sid}/services", json={"service_ids": ids}, headers=csrf_headers
    )
    assert assign.status_code == 200
    listed = auth_client.get(f"/api/services/{ids[0]}/stylists?active=true", headers=bot_headers)
    assert any(row["id"] == sid for row in listed.get_json())

    auth_client.put(f"/api/stylists/{sid}", json={"active": False}, headers=csrf_headers)
    deleted = auth_client.delete(f"/api/stylists/{sid}", headers=csrf_headers)
    assert deleted.status_code == 200
