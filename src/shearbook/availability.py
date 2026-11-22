"""Compute bookable appointment slots for a stylist and date."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from datetime import time as time_cls

from dateutil import parser
from sqlalchemy.orm import Session

from shearbook.calendar.base import CalendarBackend
from shearbook.holidays import is_public_holiday
from shearbook.models import Stylist, StylistException, StylistWeeklyHour
from shearbook.settings_svc import business_hours, days_off
from shearbook.timeutil import localize, now_tz, zone

Interval = tuple[datetime, datetime]


def merge_intervals(intervals: list[Interval]) -> list[Interval]:
    items = sorted([(a, b) for a, b in intervals if a < b], key=lambda x: x[0])
    if not items:
        return []
    out = [items[0]]
    for start, end in items[1:]:
        last_s, last_e = out[-1]
        if start <= last_e:
            out[-1] = (last_s, max(last_e, end))
        else:
            out.append((start, end))
    return out


def subtract_blocks(windows: list[Interval], blocks: list[Interval]) -> list[Interval]:
    if not windows:
        return []
    if not blocks:
        return windows
    result: list[Interval] = []
    for w_start, w_end in windows:
        segments = [(w_start, w_end)]
        for b_start, b_end in blocks:
            new_segments: list[Interval] = []
            for start, end in segments:
                if end <= b_start or start >= b_end:
                    new_segments.append((start, end))
                    continue
                if start < b_start:
                    new_segments.append((start, min(b_start, end)))
                if end > b_end:
                    new_segments.append((max(b_end, start), end))
            segments = [(s, e) for (s, e) in new_segments if e > s]
        result.extend(segments)
    return merge_intervals(result)


def ceil_to_step(dt: datetime, step_min: int) -> datetime:
    minutes = dt.hour * 60 + dt.minute
    rem = minutes % step_min
    if rem == 0 and dt.second == 0 and dt.microsecond == 0:
        return dt.replace(second=0, microsecond=0)
    add = step_min - rem
    return (dt + timedelta(minutes=add)).replace(second=0, microsecond=0)


def generate_slots(
    free_intervals: list[Interval],
    duration_min: int,
    slot_step_min: int,
) -> list[str]:
    dur = timedelta(minutes=duration_min)
    step = timedelta(minutes=slot_step_min)
    out: list[str] = []
    for start, end in free_intervals:
        if end <= start:
            continue
        t = ceil_to_step(start.replace(second=0, microsecond=0), slot_step_min)
        while t + dur <= end:
            out.append(t.strftime("%H:%M"))
            t += step
    return list(dict.fromkeys(out))


def personal_windows(
    session: Session,
    stylist_id: int,
    day: date,
    tz_name: str,
) -> tuple[list[Interval], str | None]:
    """Return working windows and an optional machine-readable close reason."""
    exceptions = (
        session.query(StylistException)
        .filter(StylistException.stylist_id == stylist_id, StylistException.date == day)
        .all()
    )
    for ex in exceptions:
        if ex.type.value == "OFF":
            return [], "stylist_off"

    weekly = (
        session.query(StylistWeeklyHour)
        .filter(
            StylistWeeklyHour.stylist_id == stylist_id, StylistWeeklyHour.weekday == day.weekday()
        )
        .order_by(StylistWeeklyHour.start_time)
        .all()
    )
    if not weekly:
        return [], "closed_weekly"

    base: list[Interval] = []
    for row in weekly:
        if row.start_time and row.end_time and row.end_time > row.start_time:
            base.append(
                (localize(day, row.start_time, tz_name), localize(day, row.end_time, tz_name))
            )
    base = merge_intervals(base)
    if not base:
        return [], "closed_weekly"

    custom: list[Interval] = []
    for ex in exceptions:
        if (
            ex.type.value == "CUSTOM"
            and ex.start_time
            and ex.end_time
            and ex.end_time > ex.start_time
        ):
            custom.append(
                (localize(day, ex.start_time, tz_name), localize(day, ex.end_time, tz_name))
            )
    windows = subtract_blocks(base, custom) if custom else base
    if not windows:
        return [], "no_windows"
    return windows, None


def get_free_slots(
    session: Session,
    calendar: CalendarBackend,
    date_str: str,
    duration_min: int,
    *,
    stylist_id: int | None = None,
    calendar_id: str | None = None,
    tz_name: str = "Europe/Berlin",
    holiday_country: str = "DE",
    holiday_region: str = "",
    slot_step_min: int = 30,
    ignore: Interval | None = None,
) -> tuple[list[str], str]:
    if not isinstance(duration_min, int) or duration_min <= 0:
        return [], "invalid"
    try:
        day = parser.parse(date_str).date()
    except Exception:
        return [], "invalid"

    if day.weekday() in days_off(session):
        return [], "global_day_off"
    if is_public_holiday(day, holiday_country, holiday_region):
        return [], "public_holiday"

    stylist: Stylist | None = None
    if stylist_id is not None:
        stylist = session.get(Stylist, int(stylist_id))
        if not stylist:
            return [], "invalid"
        calendar_id = calendar_id or stylist.calendar_id

    if not calendar_id:
        return [], "no_calendar"

    if stylist_id is not None:
        windows, reason = personal_windows(session, int(stylist_id), day, tz_name)
        if reason:
            return [], reason
    else:
        start_t, end_t = business_hours(session)
        windows = [(localize(day, start_t, tz_name), localize(day, end_t, tz_name))]

    if not windows:
        return [], "no_windows"

    union_start = min(w[0] for w in windows)
    union_end = max(w[1] for w in windows)
    busy = [
        (b.start.astimezone(zone(tz_name)), b.end.astimezone(zone(tz_name)))
        for b in calendar.list_busy(calendar_id, union_start, union_end)
        if b.end > b.start
    ]
    busy = merge_intervals(busy)
    if ignore is not None:
        busy = subtract_blocks(busy, [ignore])
    free = subtract_blocks(windows, busy)
    if not free:
        return [], "fully_booked"

    slots = generate_slots(free, duration_min, slot_step_min)
    now = now_tz(tz_name)
    if day == now.date():
        slots = [
            s
            for s in slots
            if localize(day, time_cls.fromisoformat(s), tz_name) >= now.replace(second=0)
        ]
    if not slots:
        return [], "fully_booked"
    return slots, "ok"


def slot_is_free(
    session: Session,
    calendar: CalendarBackend,
    date_str: str,
    start_hhmm: str,
    duration_min: int,
    stylist_id: int,
    **kwargs,
) -> bool:
    slots, reason = get_free_slots(
        session, calendar, date_str, duration_min, stylist_id=stylist_id, **kwargs
    )
    return reason == "ok" and start_hhmm in slots


def appointment_interval(day, start_time, duration_min: int, tz_name: str) -> Interval:
    start = localize(day, start_time, tz_name)
    return start, start + timedelta(minutes=duration_min)
