# friseurbot/utils/calendar_tools.py
from __future__ import annotations

from datetime import date as date_cls
from datetime import datetime, time, timedelta
from typing import List, Optional, Tuple

import pytz
from dateutil import parser

from friseurbot.utils.auth_google import get_calendar_service, get_credentials
from friseurbot.utils.db.helper import get_setting

BERLIN_TZ = pytz.timezone("Europe/Berlin")
DEFAULT_START = time(9, 0)  # 09:00
DEFAULT_END = time(18, 0)  # 18:00

# Map human day names (case-insensitive) to Python weekday() numbers (Mon=0..Sun=6)
DAY_NAME_TO_NUM = {
    "monday": 0,
    "mon": 0,
    "tuesday": 1,
    "tue": 1,
    "tues": 1,
    "wednesday": 2,
    "wed": 2,
    "thursday": 3,
    "thu": 3,
    "thur": 3,
    "thurs": 3,
    "friday": 4,
    "fri": 4,
    "saturday": 5,
    "sat": 5,
    "sunday": 6,
    "sun": 6,
}


def _parse_time_or_default(value: Optional[str], default: time) -> time:
    """Parse 'HH:MM' string; fall back to the given default on None/invalid."""
    if not value:
        return default
    try:
        return datetime.strptime(value, "%H:%M").time()
    except Exception:
        return default


def _is_day_off(d: date_cls) -> bool:
    """Return True if given date is listed in settings 'days_off' (comma-separated names)."""
    days_str = get_setting("days_off") or ""
    if not days_str.strip():
        return False
    names = [s.strip().lower() for s in days_str.split(",") if s.strip()]
    daynums = {
        DAY_NAME_TO_NUM.get(n) for n in names if DAY_NAME_TO_NUM.get(n) is not None
    }
    return d.weekday() in daynums


def _clip_to_business_hours(d: date_cls) -> Tuple[datetime, datetime]:
    """Return (start_of_day, end_of_day) localized to Europe/Berlin based on settings."""
    start_cfg = get_setting("business_hours_start")
    end_cfg = get_setting("business_hours_end")
    start_t = _parse_time_or_default(start_cfg, DEFAULT_START)
    end_t = _parse_time_or_default(end_cfg, DEFAULT_END)
    start_dt = BERLIN_TZ.localize(datetime.combine(d, start_t))
    end_dt = BERLIN_TZ.localize(datetime.combine(d, end_t))
    # Ensure start < end
    if end_dt <= start_dt:
        # Fallback to defaults if misconfigured
        start_dt = BERLIN_TZ.localize(datetime.combine(d, DEFAULT_START))
        end_dt = BERLIN_TZ.localize(datetime.combine(d, DEFAULT_END))
    return start_dt, end_dt


def get_free_slots(
    date_str: str, duration_min: int, calendar_id: Optional[str]
) -> List[str]:
    """
    Compute free start times (HH:MM) for a given day/duration on a specific Google Calendar.

    Args:
        date_str: Date string in 'YYYY-MM-DD'.
        duration_min: Appointment duration in minutes.
        calendar_id: Target Google Calendar ID (required).

    Returns:
        List of 'HH:MM' strings representing available start times.

    Notes:
        - Respects business hours from settings (defaults 09:00–18:00).
        - Skips days in 'days_off' setting (e.g., 'Sunday').
        - For today's date, past slots (relative to now in Europe/Berlin) are filtered out.
        - Step equals the requested duration (no gap between slots).
    """
    if not calendar_id:
        return []

    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        # Invalid date format → no slots
        return []

    # Respect days_off
    if _is_day_off(d):
        return []

    # Build time window
    start_of_day, end_of_day = _clip_to_business_hours(d)

    # Build Calendar client
    service = get_calendar_service()

    # Fetch events within business hours
    events_result = (
        service.events()
        .list(
            calendarId=calendar_id,
            timeMin=start_of_day.isoformat(),
            timeMax=end_of_day.isoformat(),
            singleEvents=True,
            orderBy="startTime",
            timeZone="Europe/Berlin",
        )
        .execute()
    )

    items = events_result.get("items", [])
    busy_times: List[Tuple[datetime, datetime]] = []

    for ev in items:
        start_iso = ev.get("start", {}).get("dateTime")
        end_iso = ev.get("end", {}).get("dateTime")
        if not start_iso or not end_iso:
            continue
        try:
            st = parser.isoparse(start_iso)
            en = parser.isoparse(end_iso)
            # Ensure timezone-aware in Berlin TZ (Google returns tz-aware; fallback if not)
            if st.tzinfo is None:
                st = BERLIN_TZ.localize(st)
            if en.tzinfo is None:
                en = BERLIN_TZ.localize(en)
            busy_times.append((st, en))
        except Exception:
            continue

    # Sentinel to close the day loop
    busy_times.append((end_of_day, end_of_day))
    busy_times.sort(key=lambda t: t[0])

    # Generate free slots with step = duration
    free_slots: List[str] = []
    step = timedelta(minutes=max(int(duration_min or 0), 1))
    current = start_of_day

    # If today, skip past times relative to 'now' in Berlin
    now_berlin = datetime.now(BERLIN_TZ)
    if d == now_berlin.date() and now_berlin > current:
        # Round up to the next 'step' boundary relative to business start
        delta = now_berlin - start_of_day
        steps_passed = int(delta.total_seconds() // step.total_seconds())
        current = start_of_day + (steps_passed + 1) * step
        if current < now_berlin:
            current += step

    for busy_start, busy_end in busy_times:
        while current + step <= busy_start:
            # Only include slots fully within business hours
            if current >= start_of_day and (current + step) <= end_of_day:
                free_slots.append(current.time().strftime("%H:%M"))
            current += step
        # Move current pointer past the busy window
        if current < busy_end:
            current = busy_end

    return free_slots


def create_calendar_for_friseur(friseur_name: str) -> str:
    """
    Create a dedicated Google Calendar for a friseur (stylist) and return its ID.
    """
    service = get_calendar_service()
    calendar = {
        "summary": f"Friseur – {friseur_name}",
        "timeZone": "Europe/Berlin",
    }
    created = service.calendars().insert(body=calendar).execute()
    return created["id"]
