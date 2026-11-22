from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from shearbook.calendar.local import LocalCalendar
from shearbook.db.seed import seed_all
from shearbook.db.session import get_session
from shearbook.models import Service, Stylist
from shearbook.settings_svc import business_hours, days_off
from shearbook.timeutil import hhmm, parse_hhmm


def test_local_calendar_lifecycle(app):
    tz = ZoneInfo("Europe/Berlin")
    start = datetime(2026, 3, 3, 10, 0, tzinfo=tz)
    end = start + timedelta(hours=1)
    with app.app_context():
        session = get_session()
        cal = LocalCalendar(session)
        calendar_id = cal.create_calendar("Test", "Europe/Berlin")
        event_id = cal.create_event(calendar_id, "Cut", "Tel: 1", start, end, "Europe/Berlin")
        busy = cal.list_busy(calendar_id, start - timedelta(hours=1), end + timedelta(hours=1))
        assert len(busy) == 1
        new_start = start + timedelta(hours=2)
        new_end = new_start + timedelta(hours=1)
        cal.update_event(
            calendar_id, event_id, "Cut", "Tel: 1", new_start, new_end, "Europe/Berlin"
        )
        other = cal.create_calendar("Other", "Europe/Berlin")
        cal.move_event(
            event_id, calendar_id, other, "Cut", "Tel: 1", new_start, new_end, "Europe/Berlin"
        )
        assert cal.list_busy(calendar_id, new_start, new_end) == []
        assert len(cal.list_busy(other, new_start, new_end)) == 1
        cal.delete_event(other, event_id)
        cal.delete_calendar(other)
        session.commit()


def test_seed_is_idempotent(app):
    with app.app_context():
        session = get_session()
        cal = LocalCalendar(session)
        seed_all(session, calendar=cal)
        seed_all(session, calendar=cal)
        session.commit()
        assert session.query(Service).count() >= 1
        assert session.query(Stylist).count() >= 1
        assert days_off(session)
        start, end = business_hours(session)
        assert hhmm(start) == "09:00"
        assert hhmm(end) == "18:00"


def test_parse_hhmm_fallbacks():
    from datetime import time as time_cls

    assert parse_hhmm("nope", time_cls(8, 0)) == time_cls(8, 0)
    try:
        parse_hhmm("nope")
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError")
    assert hhmm(__import__("datetime").time(8, 5)) == "08:05"
