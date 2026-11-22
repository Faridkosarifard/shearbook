from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from shearbook.calendar.google import (
    GoogleAuthError,
    GoogleCalendar,
    load_credentials,
    run_oauth_flow,
)


def test_load_credentials_missing(tmp_path):
    with pytest.raises(GoogleAuthError):
        load_credentials(tmp_path / "token.json", tmp_path / "credentials.json", ["scope"])


def test_run_oauth_requires_client_file(tmp_path):
    with pytest.raises(GoogleAuthError):
        run_oauth_flow(tmp_path / "token.json", tmp_path / "missing.json", ["scope"])


def test_google_backend_methods(monkeypatch, tmp_path):
    class FakeEvents:
        def __init__(self):
            self.deleted = []

        def insert(self, calendarId, body):
            return self

        def patch(self, calendarId, eventId, body):
            return self

        def delete(self, calendarId, eventId):
            self.deleted.append((calendarId, eventId))
            return self

        def execute(self):
            return {"id": "evt-1"}

    class FakeCalendars:
        def insert(self, body):
            return self

        def delete(self, calendarId):
            return self

        def execute(self):
            return {"id": "cal-1"}

    class FakeFreeBusy:
        def query(self, body):
            self.body = body
            return self

        def execute(self):
            start = "2026-03-03T10:00:00+01:00"
            end = "2026-03-03T11:00:00+01:00"
            return {"calendars": {"cal-1": {"busy": [{"start": start, "end": end}]}}}

    class FakeService:
        def __init__(self):
            self._events = FakeEvents()
            self._calendars = FakeCalendars()
            self._freebusy = FakeFreeBusy()

        def calendars(self):
            return self._calendars

        def events(self):
            return self._events

        def freebusy(self):
            return self._freebusy

    service = FakeService()
    monkeypatch.setattr("shearbook.calendar.google.load_credentials", lambda *a, **k: object())
    monkeypatch.setattr("shearbook.calendar.google.build", lambda *a, **k: service)

    backend = GoogleCalendar(tmp_path / "token.json", tmp_path / "creds.json", ["scope"])
    assert backend.create_calendar("Alex", "Europe/Berlin") == "cal-1"
    tz = ZoneInfo("Europe/Berlin")
    start = datetime(2026, 3, 3, 9, 0, tzinfo=tz)
    end = start + timedelta(hours=2)
    busy = backend.list_busy("cal-1", start, end)
    assert len(busy) == 1
    assert backend.create_event("cal-1", "Cut", "", start, end, "Europe/Berlin") == "evt-1"
    assert backend.update_event("cal-1", "evt-1", "Cut", "", start, end, "Europe/Berlin") == "evt-1"
    assert (
        backend.move_event("evt-1", "cal-1", "cal-2", "Cut", "", start, end, "Europe/Berlin")
        == "evt-1"
    )
    backend.delete_event("cal-1", "evt-1")
    backend.delete_calendar("cal-1")
    assert ("cal-1", "evt-1") in service._events.deleted
