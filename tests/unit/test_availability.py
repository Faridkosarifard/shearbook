from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from shearbook.availability import generate_slots, get_free_slots, merge_intervals, subtract_blocks
from shearbook.calendar.local import LocalCalendar
from shearbook.db.session import get_session
from shearbook.models import StylistException
from shearbook.models.schedule import ExceptionType
from shearbook.settings_svc import upsert_settings
from shearbook.timeutil import localize

TZ = "Europe/Berlin"


def _slots(app, stylist, day, duration=30, **kwargs):
    with app.app_context():
        session = get_session()
        calendar = LocalCalendar(session)
        slots, reason = get_free_slots(
            session,
            calendar,
            day,
            duration,
            stylist_id=stylist["id"],
            calendar_id=stylist["calendar_id"],
            tz_name=TZ,
            holiday_country="DE",
            holiday_region="BW",
            slot_step_min=30,
            **kwargs,
        )
        return slots, reason


def test_interval_algebra():
    tz = ZoneInfo(TZ)
    a = (datetime(2026, 3, 2, 9, 0, tzinfo=tz), datetime(2026, 3, 2, 12, 0, tzinfo=tz))
    b = (datetime(2026, 3, 2, 11, 0, tzinfo=tz), datetime(2026, 3, 2, 13, 0, tzinfo=tz))
    merged = merge_intervals([a, b])
    assert merged == [(a[0], b[1])]
    leftover = subtract_blocks([a], [b])
    assert leftover == [(a[0], datetime(2026, 3, 2, 11, 0, tzinfo=tz))]


def test_generate_slots_requires_full_duration():
    tz = ZoneInfo(TZ)
    window = [(datetime(2026, 3, 2, 9, 0, tzinfo=tz), datetime(2026, 3, 2, 11, 0, tzinfo=tz))]
    slots = generate_slots(window, duration_min=60, slot_step_min=30)
    assert slots == ["09:00", "09:30", "10:00"]
    slots90 = generate_slots(window, duration_min=90, slot_step_min=30)
    assert slots90 == ["09:00", "09:30"]


def test_weekday_without_template_is_closed(app, stylist):
    # 7 March 2026 is a Saturday; the demo stylist has no weekend template.
    slots, reason = _slots(app, stylist, "2026-03-07")
    assert slots == []
    assert reason == "closed_weekly"


def test_public_holiday_closes_salon(app, stylist):
    slots, reason = _slots(app, stylist, "2026-04-06")  # Easter Monday 2026
    assert reason == "public_holiday"
    assert slots == []


def test_global_day_off(app, stylist):
    with app.app_context():
        session = get_session()
        upsert_settings(session, {"days_off": "Monday"})
        session.commit()
    slots, reason = _slots(app, stylist, "2026-03-02")  # Monday
    assert reason == "global_day_off"


def test_stylist_off_exception(app, stylist):
    day = date(2026, 3, 3)  # Tuesday
    with app.app_context():
        session = get_session()
        session.add(StylistException(stylist_id=stylist["id"], date=day, type=ExceptionType.OFF))
        session.commit()
    slots, reason = _slots(app, stylist, "2026-03-03")
    assert reason == "stylist_off"
    assert slots == []


def test_custom_exception_subtracts_window(app, stylist):
    day = date(2026, 3, 3)
    with app.app_context():
        session = get_session()
        session.add(
            StylistException(
                stylist_id=stylist["id"],
                date=day,
                type=ExceptionType.CUSTOM,
                start_time=time(12, 0),
                end_time=time(14, 0),
            )
        )
        session.commit()
    slots, reason = _slots(app, stylist, "2026-03-03", duration=30)
    assert reason == "ok"
    assert "12:00" not in slots
    assert "13:30" not in slots
    assert "11:30" in slots
    assert "14:00" in slots


def test_busy_event_blocks_duration(app, stylist):
    day = date(2026, 3, 3)
    with app.app_context():
        session = get_session()
        calendar = LocalCalendar(session)
        calendar.create_event(
            stylist["calendar_id"],
            "Busy",
            "",
            localize(day, time(10, 0), TZ),
            localize(day, time(11, 0), TZ),
            TZ,
        )
        session.commit()
    slots, reason = _slots(app, stylist, "2026-03-03", duration=60)
    assert reason == "ok"
    assert "09:00" in slots
    assert "09:30" not in slots
    assert "10:00" not in slots
    assert "10:30" not in slots
    assert "11:00" in slots


def test_ignore_interval_frees_own_slot(app, stylist):
    day = date(2026, 3, 3)
    start = localize(day, time(10, 0), TZ)
    end = start + timedelta(hours=1)
    with app.app_context():
        session = get_session()
        calendar = LocalCalendar(session)
        calendar.create_event(stylist["calendar_id"], "Mine", "", start, end, TZ)
        session.commit()
    slots, _ = _slots(app, stylist, "2026-03-03", duration=60, ignore=(start, end))
    assert "10:00" in slots
