# friseurbot/utils/calendar_tools.py
from __future__ import annotations

# Standard library
from datetime import date as date_cls
from datetime import datetime
from datetime import time
from datetime import timedelta
from functools import lru_cache
from typing import Dict
from typing import List
from typing import Optional
from typing import Tuple

# Third-party (others)
import pytz
from dateutil import parser
from flask import current_app

# SQLAlchemy
from sqlalchemy import select
from sqlalchemy import update

# Friseurbot
from friseurbot.entity import Appointment
from friseurbot.entity import Friseur
from friseurbot.entity import FriseurException
from friseurbot.entity import FriseurWeeklyHour
from friseurbot.entity import Service
from friseurbot.utils.auth_google import get_calendar_service
from friseurbot.utils.db.helper import get_setting
from friseurbot.utils.db.manager import db_manager

# ---- Constants / Defaults ----
BERLIN_TZ = pytz.timezone("Europe/Berlin")
DEFAULT_START = time(9, 0)  # 09:00
DEFAULT_END = time(18, 0)  # 18:00
SLOT_STEP_MIN = 30  # show candidate starts every 30 minutes

# Human day names → weekday numbers (Mon=0..Sun=6)
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

# --- Public Holidays (DE-BW) ---
try:
    # Third-party (others)
    import holidays

    _HAS_HOLIDAYS = True
except Exception:
    holidays = None  # type: ignore
    _HAS_HOLIDAYS = False


# ---------------- Helpers: settings / times ----------------


def _parse_time_or_default(value: Optional[str], default: time) -> time:
    """Parse 'HH:MM' string, falling back to default on invalid/missing."""
    if not value:
        return default
    try:
        return datetime.strptime(value, "%H:%M").time()
    except Exception:
        return default


@lru_cache(maxsize=1)
def _cached_days_off() -> set[int]:
    """Return a set of weekday numbers (0=Mon..6=Sun) globally configured as days off."""
    days_str = (get_setting("days_off") or "").strip()
    if not days_str:
        return set()
    names = [s.strip().lower() for s in days_str.split(",") if s.strip()]
    return {DAY_NAME_TO_NUM[n] for n in names if DAY_NAME_TO_NUM.get(n) is not None}


def _is_day_off(d: date_cls) -> bool:
    """
    Return True if the given date is listed in global `days_off` setting.
    This represents a system-wide closure, independent of stylists.
    """
    return d.weekday() in _cached_days_off()


@lru_cache(maxsize=64)
def _cached_business_hours(year: int) -> Tuple[time, time]:
    """Cache global business hours per year to avoid repeated setting lookups."""
    start_cfg = get_setting("business_hours_start")
    end_cfg = get_setting("business_hours_end")
    return (
        _parse_time_or_default(start_cfg, DEFAULT_START),
        _parse_time_or_default(end_cfg, DEFAULT_END),
    )


def _clip_to_business_hours(d: date_cls) -> Tuple[datetime, datetime]:
    """
    Return business hour window for the date based on global settings.
    Falls back to 09:00–18:00 if misconfigured.
    """
    start_t, end_t = _cached_business_hours(d.year)
    start_dt = BERLIN_TZ.localize(datetime.combine(d, start_t))
    end_dt = BERLIN_TZ.localize(datetime.combine(d, end_t))
    if end_dt <= start_dt:
        start_dt = BERLIN_TZ.localize(datetime.combine(d, DEFAULT_START))
        end_dt = BERLIN_TZ.localize(datetime.combine(d, DEFAULT_END))
    return start_dt, end_dt


@lru_cache(maxsize=8)
def _holiday_calendar(year: int):
    """Cache holiday calendar object for Baden-Württemberg per year."""
    if not _HAS_HOLIDAYS:
        return None
    try:
        return holidays.country_holidays("DE", prov="BW", years=year)  # type: ignore
    except Exception:
        return None


def _is_public_holiday(d: date_cls) -> bool:
    """Return True if date is a public holiday in Baden-Württemberg (DE-BW)."""
    cal = _holiday_calendar(d.year)
    return bool(cal and d in cal)


# ---------------- Helpers: interval algebra ----------------


def _merge_intervals(
    intervals: List[Tuple[datetime, datetime]],
) -> List[Tuple[datetime, datetime]]:
    """Merge overlapping intervals into continuous blocks."""
    xs = sorted([(a, b) for a, b in intervals if a < b], key=lambda x: x[0])
    if not xs:
        return []
    out = [xs[0]]
    for s, e in xs[1:]:
        ls, le = out[-1]
        if s <= le:
            out[-1] = (ls, max(le, e))
        else:
            out.append((s, e))
    return out


def _subtract_blocks(
    windows: List[Tuple[datetime, datetime]],
    blocks: List[Tuple[datetime, datetime]],
) -> List[Tuple[datetime, datetime]]:
    """
    Subtract `blocks` (closed intervals) from working `windows` and return remaining open windows.
    Intervals are tz-aware and assumed valid (start < end).
    """
    if not windows or not blocks:
        return windows

    result: List[Tuple[datetime, datetime]] = []
    for w_start, w_end in windows:
        segments = [(w_start, w_end)]
        for b_start, b_end in blocks:
            new_segments: List[Tuple[datetime, datetime]] = []
            for s, e in segments:
                # no overlap
                if e <= b_start or s >= b_end:
                    new_segments.append((s, e))
                    continue
                # overlap -> keep the parts outside the block
                if s < b_start:
                    new_segments.append((s, min(b_start, e)))
                if e > b_end:
                    new_segments.append((max(b_end, s), e))
            segments = [(s, e) for (s, e) in new_segments if e > s]
        result.extend(segments)

    # Normalize / merge touching intervals
    result.sort(key=lambda x: x[0])
    merged: List[Tuple[datetime, datetime]] = []
    for s, e in result:
        if not merged or s > merged[-1][1]:
            merged.append((s, e))
        else:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
    return merged


def _clip_interval(
    a: datetime, b: datetime, w_start: datetime, w_end: datetime
) -> Optional[Tuple[datetime, datetime]]:
    """Clip interval (a,b) to within (w_start,w_end)."""
    s = max(a, w_start)
    e = min(b, w_end)
    return (s, e) if s < e else None


def _subtract_busy_from_window(
    w_start: datetime, w_end: datetime, busy: List[Tuple[datetime, datetime]]
) -> List[Tuple[datetime, datetime]]:
    """
    Subtract busy intervals from a working window and return free sub-windows.
    Busy intervals must be merged beforehand.
    """
    free: List[Tuple[datetime, datetime]] = []
    cur = w_start
    for bs, be in busy:
        if be <= cur:
            continue
        if bs >= w_end:
            break
        if bs > cur:
            free.append((cur, min(bs, w_end)))
        cur = max(cur, be)
        if cur >= w_end:
            break
    if cur < w_end:
        free.append((cur, w_end))
    return [iv for iv in free if iv[0] < iv[1]]


def _ceil_to_step(dt: datetime, step_min: int) -> datetime:
    """Round dt up to the next step_min grid."""
    minutes = dt.hour * 60 + dt.minute
    rem = minutes % step_min
    if rem == 0 and dt.second == 0 and dt.microsecond == 0:
        return dt.replace(second=0, microsecond=0)
    add = step_min - rem
    return (dt + timedelta(minutes=add)).replace(second=0, microsecond=0)


def _gen_slots(
    free_intervals: List[Tuple[datetime, datetime]],
    duration_min: int,
    slot_step_min: Optional[int] = SLOT_STEP_MIN,
    buffer_before_min: int = 0,
    buffer_after_min: int = 0,
) -> List[str]:
    """
    Generate start times on a fixed grid (default: every 30 minutes),
    but only include starts where the *full* duration (plus optional buffers)
    fits entirely inside a single free interval.

    Examples
    --------
    - Working hours 09:00–17:00
    - Busy at 10:00–10:30
    - Service duration 90 minutes
      → 09:00 is NOT offered, because 09:00–10:30 crosses a busy block.
      → 09:30 is NOT offered for the same reason.
      → 10:30 may be offered if 10:30–12:00 is free, etc.
    """
    dur = timedelta(minutes=duration_min + buffer_before_min + buffer_after_min)
    step = timedelta(minutes=slot_step_min)

    out: List[str] = []
    for fs, fe in free_intervals:
        # Apply buffers to both ends
        start = fs + timedelta(minutes=buffer_before_min)
        end = fe - timedelta(minutes=buffer_after_min)
        if end <= start:
            continue

        t = _ceil_to_step(
            start.replace(second=0, microsecond=0), int(step.total_seconds() // 60)
        )
        while t + dur <= end:  # entire duration must fit in the SAME free interval
            out.append(t.strftime("%H:%M"))  # result aligned to the half-hour grid
            t += step
    return out


# ---------------- Helpers: personal schedule ----------------


def _merge_windows(
    windows: List[Tuple[datetime, datetime]],
) -> List[Tuple[datetime, datetime]]:
    """Merge overlapping windows; assumes all on the same day & tz-aware."""
    return _merge_intervals(windows)


def _get_personal_windows(
    d: date_cls, friseur_id: int
) -> List[Tuple[datetime, datetime]]:
    """
    Get working windows (start,end) for a specific date and stylist.

    Semantics:
      - OFF exception  => closed all day (return []).
      - CUSTOM entries => CLOSED blocks to subtract from weekly windows for that date.
      - Weekly template rows define the base working windows.
      - If no weekly rows and no exceptions => closed (no global fallback).
    """
    session = db_manager.get_session()
    try:
        ex_list = (
            session.query(FriseurException)
            .filter(
                FriseurException.friseur_id == friseur_id, FriseurException.date == d
            )
            .all()
        )

        # OFF ⇒ closed all day
        for ex in ex_list:
            t = getattr(ex, "type", None)
            tval = t.value if hasattr(t, "value") else t
            if tval == "OFF":
                return []

        # Base windows from weekly template
        weekday = d.weekday()
        weekly = (
            session.query(FriseurWeeklyHour)
            .filter(
                FriseurWeeklyHour.friseur_id == friseur_id,
                FriseurWeeklyHour.weekday == weekday,
            )
            .order_by(FriseurWeeklyHour.start_time)
            .all()
        )
        if not weekly:
            # No weekly rows → closed (even if CUSTOM blocks exist, nothing to subtract from)
            return []

        base_windows = []
        for w in weekly:
            if w.end_time and w.start_time and w.end_time > w.start_time:
                base_windows.append(
                    (
                        BERLIN_TZ.localize(datetime.combine(d, w.start_time)),
                        BERLIN_TZ.localize(datetime.combine(d, w.end_time)),
                    )
                )

        base_windows = _merge_windows(base_windows)

        # Collect CUSTOM blocks (closed intervals) to subtract
        custom_blocks: List[Tuple[datetime, datetime]] = []
        for ex in ex_list:
            t = getattr(ex, "type", None)
            tval = t.value if hasattr(t, "value") else t
            if (
                tval == "CUSTOM"
                and ex.start_time
                and ex.end_time
                and ex.end_time > ex.start_time
            ):
                custom_blocks.append(
                    (
                        BERLIN_TZ.localize(datetime.combine(d, ex.start_time)),
                        BERLIN_TZ.localize(datetime.combine(d, ex.end_time)),
                    )
                )

        return (
            _merge_windows(_subtract_blocks(base_windows, custom_blocks))
            if custom_blocks
            else base_windows
        )
    finally:
        db_manager.close()


# ---------------- Helpers: events / intervals ----------------


def _dt_from_google(v: dict) -> datetime:
    """
    Convert Google Calendar time dict to a tz-aware datetime (Europe/Berlin).
    Handles both `dateTime` and all-day `date` formats.
    """
    if "dateTime" in v:
        dt = parser.parse(v["dateTime"])
        if dt.tzinfo is None:
            dt = BERLIN_TZ.localize(dt)
        return dt.astimezone(BERLIN_TZ)
    elif "date" in v:
        # All-day start at 00:00 local
        d0 = parser.parse(v["date"]).date()
        return BERLIN_TZ.localize(datetime.combine(d0, time(0, 0)))
    else:
        # Fallback: now (should not happen)
        return BERLIN_TZ.localize(datetime.utcnow()).astimezone(BERLIN_TZ)


def _event_interval(item: dict) -> Tuple[datetime, datetime]:
    """
    Extract (start,end) from a calendar event.
    For all-day events, `end` is typically 00:00 of the following day.
    Ensures `end > start`.
    """
    s = _dt_from_google(item.get("start", {}))
    e = _dt_from_google(item.get("end", {}))
    if e <= s:
        e = s + timedelta(minutes=1)
    return s, e


def _fetch_busy_intervals_freebusy(
    calendar_id: str, windows: List[Tuple[datetime, datetime]]
) -> List[Tuple[datetime, datetime]]:
    """
    Use Google Calendar FreeBusy API to fetch busy intervals covering the union window.
    Returns merged busy intervals (tz-aware, Europe/Berlin).
    """
    if not windows:
        return []

    union_start = min(w[0] for w in windows)
    union_end = max(w[1] for w in windows)

    service = get_calendar_service()
    body = {
        "timeMin": union_start.isoformat(),
        "timeMax": union_end.isoformat(),
        "timeZone": "Europe/Berlin",
        "items": [{"id": calendar_id}],
    }
    resp = service.freebusy().query(body=body).execute()
    cal_busy = resp.get("calendars", {}).get(calendar_id, {}).get("busy", [])

    busy_all: List[Tuple[datetime, datetime]] = []
    for b in cal_busy:
        es = parser.parse(b["start"]).astimezone(BERLIN_TZ)
        ee = parser.parse(b["end"]).astimezone(BERLIN_TZ)
        if ee > es:
            busy_all.append((es, ee))

    return _merge_intervals(busy_all)


# ---------------- Main: free slots ----------------


def get_free_slots(
    date_str: str,
    duration_min: int,
    calendar_id: Optional[str],
    friseur_id: Optional[int] = None,
) -> List[str]:
    """
    Compute free appointment slots for a given date and duration (Europe/Berlin),
    aligned to a fixed half-hour grid, but only if the full duration fits.

    Behaviour:
      - Global `days_off` closes the day for everyone.
      - Public holidays in DE-BW close the day for everyone.
      - For a stylist:
          * OFF exception => closed all day.
          * CUSTOM exceptions => closed blocks to subtract from weekly windows.
          * Weekly rows define base windows.
          * No weekly & no exceptions => closed (no global fallback).
      - For non-stylist (friseur_id=None), use global business hours.
      - Google Calendar busy events are respected.
      - For today, past start times are filtered out.
      - Start step is 30 minutes; duration must fully fit inside a free interval.
    """
    if not isinstance(duration_min, int) or duration_min <= 0:
        return []

    try:
        d = parser.parse(date_str).date()
    except Exception:
        return []

    if _is_day_off(d):
        return []

    # Public holiday in Baden-Württemberg => closed for everyone
    if _is_public_holiday(d):
        return []

    # Resolve calendar id from stylist if needed
    if friseur_id and not calendar_id:
        session = db_manager.get_session()
        try:
            fr = session.get(Friseur, int(friseur_id))
            if not fr or not fr.calendar_id:
                return []
            calendar_id = fr.calendar_id
        finally:
            db_manager.close()

    if not calendar_id:
        return []

    # Build windows
    if friseur_id:
        windows = _get_personal_windows(d, int(friseur_id))
    else:
        windows = [_clip_to_business_hours(d)]

    if not windows:
        return []

    # Fetch busy intervals with a single FreeBusy request
    busy_merged = _fetch_busy_intervals_freebusy(calendar_id, windows)

    # Subtract busy from each working window
    free_windows: List[Tuple[datetime, datetime]] = []
    for w_start, w_end in windows:
        relevant = []
        for bs, be in busy_merged:
            clip = _clip_interval(bs, be, w_start, w_end)
            if clip:
                relevant.append(clip)
        relevant = _merge_intervals(relevant)
        free_windows.extend(_subtract_busy_from_window(w_start, w_end, relevant))

    # Generate slots on a half-hour grid, ensuring full duration fits
    slots = _gen_slots(
        free_windows,
        duration_min=duration_min,
        slot_step_min=SLOT_STEP_MIN,
        buffer_before_min=0,
        buffer_after_min=0,
    )

    # If today, drop past starts
    now_berlin = datetime.now(BERLIN_TZ).replace(second=0, microsecond=0)
    if d == now_berlin.date():

        def _to_dt(hhmm: str) -> datetime:
            h, m = map(int, hhmm.split(":"))
            return BERLIN_TZ.localize(datetime.combine(d, time(h, m)))

        slots = [s for s in slots if _to_dt(s) >= now_berlin]

    # Unique + sorted
    return sorted(list(dict.fromkeys(slots)))


# ---------------- Utility: create calendar ----------------


def create_calendar_for_friseur(friseur_name: str) -> str:
    """Create a new dedicated Google Calendar for a stylist and return its calendarId."""
    service = get_calendar_service()
    calendar = {
        "summary": f"Friseur – {friseur_name}",
        "timeZone": "Europe/Berlin",
    }
    created = service.calendars().insert(body=calendar).execute()
    return created["id"]


# ---------------- Main: free slots (with meta reason) ----------------


def get_free_slots_with_meta(
    date_str: str,
    duration_min: int,
    calendar_id: Optional[str],
    friseur_id: Optional[int] = None,
):
    """
    Compute available appointment slots for a given date and duration and return both
    the slots and a machine-readable reason describing the outcome. Slots are aligned
    to a half-hour grid, and only starts that fully fit the service duration are emitted.

    Parameters
    ----------
    date_str : str
        Target date (ISO 'YYYY-MM-DD' or any parseable date string).
    duration_min : int
        Appointment duration in minutes (must be a positive integer).
    calendar_id : Optional[str]
        Google Calendar ID to query. If missing and `friseur_id` is provided, the
        function will attempt to resolve the calendar from the database.
    friseur_id : Optional[int]
        Numeric stylist ID. When provided, personal schedule (weekly template and
        exceptions) is applied. If omitted, global business hours are used.

    Returns
    -------
    Tuple[List[str], str]
        A pair of (slots, reason) where `slots` is a sorted list of "HH:MM" strings.
        `reason` is one of:
          - 'ok'               → slots exist for the requested date
          - 'global_day_off'   → globally configured day off (system-wide closure)
          - 'public_holiday'   → public holiday in Baden-Württemberg (DE-BW)
          - 'stylist_off'      → stylist has an OFF exception for that date
          - 'closed_weekly'    → stylist has no weekly working rows for that weekday
          - 'no_calendar'      → no calendar is associated with the stylist
          - 'no_windows'       → no workable windows for that date
          - 'fully_booked'     → working windows exist but all times are occupied by events
          - 'invalid'          → invalid input (date or duration)

    Notes
    -----
    - Timezone is Europe/Berlin; past times for "today" are filtered out.
    - Start step is fixed at 30 minutes, but the full duration must fit.
    """
    if not isinstance(duration_min, int) or duration_min <= 0:
        return [], "invalid"

    try:
        d = parser.parse(date_str).date()
    except Exception:
        return [], "invalid"

    # Global (system-wide) day off
    if _is_day_off(d):
        return [], "global_day_off"

    # Public holiday in Baden-Württemberg (DE-BW)
    if _is_public_holiday(d):
        return [], "public_holiday"

    # If we have a stylist but no calendar_id, resolve from DB and pre-check OFF/weekly conditions
    if friseur_id and not calendar_id:
        session = db_manager.get_session()
        try:
            fr = session.get(Friseur, int(friseur_id))
            if not fr or not fr.calendar_id:
                return [], "no_calendar"

            # OFF exception?
            ex_list = (
                session.query(FriseurException)
                .filter(
                    FriseurException.friseur_id == int(friseur_id),
                    FriseurException.date == d,
                )
                .all()
            )
            for ex in ex_list:
                t = getattr(ex, "type", None)
                tval = t.value if hasattr(t, "value") else t
                if tval == "OFF":
                    return [], "stylist_off"

            # Weekly rows present for this weekday?
            weekday = d.weekday()
            weekly = (
                session.query(FriseurWeeklyHour)
                .filter(
                    FriseurWeeklyHour.friseur_id == int(friseur_id),
                    FriseurWeeklyHour.weekday == weekday,
                )
                .all()
            )
            if not weekly:
                return [], "closed_weekly"

            calendar_id = fr.calendar_id
        finally:
            db_manager.close()

    if not calendar_id:
        return [], "no_calendar"

    # Build working windows (personal schedule if stylist provided; otherwise global business hours)
    if friseur_id:
        windows = _get_personal_windows(d, int(friseur_id))
    else:
        windows = [_clip_to_business_hours(d)]

    if not windows:
        return [], "no_windows"

    # Query busy intervals once via FreeBusy API
    busy_merged = _fetch_busy_intervals_freebusy(calendar_id, windows)

    # Build free windows by subtracting busy periods
    free_windows: List[Tuple[datetime, datetime]] = []
    for w_start, w_end in windows:
        relevant = []
        for bs, be in busy_merged:
            clip = _clip_interval(bs, be, w_start, w_end)
            if clip:
                relevant.append(clip)
        relevant = _merge_intervals(relevant)
        free_windows.extend(_subtract_busy_from_window(w_start, w_end, relevant))

    if not free_windows:
        return [], "fully_booked"

    # Generate slots on a half-hour grid, ensuring the full duration fits
    slots = _gen_slots(
        free_windows,
        duration_min=duration_min,
        slot_step_min=SLOT_STEP_MIN,
        buffer_before_min=0,
        buffer_after_min=0,
    )

    # Filter out past starts if the requested date is today
    now_berlin = datetime.now(BERLIN_TZ).replace(second=0, microsecond=0)
    if d == now_berlin.date():

        def _to_dt(hhmm: str) -> datetime:
            h, m = map(int, hhmm.split(":"))
            return BERLIN_TZ.localize(datetime.combine(d, time(h, m)))

        slots = [s for s in slots if _to_dt(s) >= now_berlin]

    # Unique + sorted
    slots = sorted(list(dict.fromkeys(slots)))
    return (slots, "ok" if slots else "fully_booked")


def _is_interval_free_in_calendar(
    calendar_id: str, start_dt: datetime, end_dt: datetime
) -> bool:
    """
    Checks with the FreeBusy API whether the interval [start_dt, end_dt) in the calendar is free or not.
    Output: True if free.
    """
    service = get_calendar_service()
    body = {
        "timeMin": start_dt.isoformat(),
        "timeMax": end_dt.isoformat(),
        "timeZone": "Europe/Berlin",
        "items": [{"id": calendar_id}],
    }
    resp = service.freebusy().query(body=body).execute()
    busy = resp.get("calendars", {}).get(calendar_id, {}).get("busy", [])
    return len(busy) == 0


def _compose_event_payload(
    appt: "Appointment",
    friseur: "Friseur",
    service_name: Optional[str],
    duration_min: int,
) -> Dict:
    """
    Builds the Google event body from Appointment.
    Assumption: appt.date (Date), appt.time (Time) are in Europe/Berlin.
    """
    start_local = BERLIN_TZ.localize(datetime.combine(appt.date, appt.time))
    end_local = start_local + timedelta(minutes=int(duration_min))

    summary = f"{service_name or 'Service'} – {appt.name}"
    description = (
        f"Reservation: {appt.reservation_code}\n"
        f"Phone: {appt.phone}\n"
        f"Friseur: {friseur.name}\n"
    )

    return {
        "summary": summary,
        "description": description,
        "start": {"dateTime": start_local.isoformat(), "timeZone": "Europe/Berlin"},
        "end": {"dateTime": end_local.isoformat(), "timeZone": "Europe/Berlin"},
    }


def create_event_for_appointment(
    session, appt_id: int, target_friseur_id: int
) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Creates an event in the destination hairdresser's calendar for an existing Appointment,
    provided that the time slot does not conflict with calendar events and that day/time slot is within the hairdresser's working hours.

    Output: (ok, message, new_event_id)
    """
    # resolve objects
    appt = session.get(Appointment, appt_id)
    new_fr = session.get(Friseur, target_friseur_id)
    if not appt or not new_fr or not new_fr.calendar_id:
        return False, "appointment_or_friseur_missing_or_no_calendar", None

    windows = _get_personal_windows(appt.date, int(target_friseur_id))
    if not windows:
        return False, "no_working_windows_that_day", None

    svc = session.get(Service, appt.service_id)
    duration_min = getattr(svc, "duration_min", None) or getattr(svc, "duration", None)
    if not duration_min:
        return False, "service_duration_missing", None

    start_local = BERLIN_TZ.localize(datetime.combine(appt.date, appt.time))
    end_local = start_local + timedelta(minutes=int(duration_min))
    fits_in_window = any(start_local >= w0 and end_local <= w1 for (w0, w1) in windows)
    if not fits_in_window:
        return False, "outside_personal_working_window", None

    if not _is_interval_free_in_calendar(new_fr.calendar_id, start_local, end_local):
        return False, "time_conflict_in_google_calendar", None

    body = _compose_event_payload(
        appt, new_fr, getattr(svc, "name", None), int(duration_min)
    )
    service = get_calendar_service()
    created = (
        service.events().insert(calendarId=new_fr.calendar_id, body=body).execute()
    )
    event_id = created.get("id")

    appt.google_event_id = event_id
    return True, "ok", event_id


def suggest_free_slots_for_appointment(
    session, appt_id: int, target_friseur_id: int
) -> List[str]:
    """
    Suggest free time for appointment.

    If the current interval overlaps, for the same date and same duration service,
    it returns the suggested free slots.
    """
    appt = session.get(Appointment, appt_id)
    new_fr = session.get(Friseur, target_friseur_id)
    if not appt or not new_fr or not new_fr.calendar_id:
        return []

    svc = session.get(Service, appt.service_id)
    duration_min = getattr(svc, "duration_min", None) or getattr(svc, "duration", None)
    if not duration_min:
        return []

    slots = get_free_slots(
        date_str=appt.date.isoformat(),
        duration_min=int(duration_min),
        calendar_id=new_fr.calendar_id,
        friseur_id=int(target_friseur_id),
    )
    return slots


def delete_calendar_for_friseur(friseur_id: int) -> Tuple[bool, str]:
    """
    Completely deletes the hairdresser's personal calendar (irreversible).

    Warning: All events in that calendar will be deleted.
    """
    session = db_manager.get_session()
    try:
        fr = session.get(Friseur, int(friseur_id))
        if not fr or not fr.calendar_id:
            return False, "friseur_or_calendar_missing"

        service = get_calendar_service()
        service.calendars().delete(calendarId=fr.calendar_id).execute()

        fr.calendar_id = None
        session.commit()
        return True, "ok"
    except Exception as e:
        session.rollback()
        return False, f"error:{e}"
    finally:
        db_manager.close()


def move_or_insert_event_for_appointment(
    session, appt_id: int, target_friseur_id: int
) -> Tuple[bool, str, Optional[str]]:
    """
    Move an appointment's existing Google event to the target hairdresser's calendar,
    or create a new event if moving is not possible.

    IMPORTANT:
    - Pre-validate the *exact* interval (start -> start+duration) against the target
      hairdresser's personal working windows and Google FreeBusy. Do NOT rely on
      grid-based slot lists here, because appointments may start off-grid (e.g., 09:15).

    Returns:
        (ok, message, new_event_id)
        - ok=True only if the event ends up in the target calendar at a valid slot.
        - message: 'moved', 'already_on_target_calendar', 'ok' on success,
                   or one of {'appointment_or_friseur_missing_or_no_calendar',
                               'service_duration_missing',
                               'no_working_windows_that_day',
                               'outside_personal_working_window',
                               'time_conflict_in_google_calendar'} on failure.
        - new_event_id: event id in the target calendar when ok=True.
    """
    appt = session.get(Appointment, appt_id)
    new_fr = session.get(Friseur, target_friseur_id)
    if not appt or not new_fr or not new_fr.calendar_id:
        return False, "appointment_or_friseur_missing_or_no_calendar", None

    svc = session.get(Service, appt.service_id)
    duration_min = getattr(svc, "duration_min", None) or getattr(svc, "duration", None)
    try:
        duration_min = int(duration_min) if duration_min is not None else None
    except Exception:
        duration_min = None
    if not duration_min or duration_min <= 0:
        return False, "service_duration_missing", None

    start_local = BERLIN_TZ.localize(datetime.combine(appt.date, appt.time))
    end_local = start_local + timedelta(minutes=int(duration_min))

    old_fr = session.get(Friseur, appt.friseur_id) if appt.friseur_id else None
    old_cal = getattr(old_fr, "calendar_id", None) if old_fr else None
    new_cal = new_fr.calendar_id

    if appt.google_event_id and old_cal == new_cal:
        return True, "already_on_target_calendar", appt.google_event_id

    windows = _get_personal_windows(appt.date, int(target_friseur_id))
    if not windows:
        return False, "no_working_windows_that_day", None
    fits_in_window = any(start_local >= w0 and end_local <= w1 for (w0, w1) in windows)
    if not fits_in_window:
        return False, "outside_personal_working_window", None

    if not _is_interval_free_in_calendar(new_cal, start_local, end_local):
        return False, "time_conflict_in_google_calendar", None

    service = get_calendar_service()

    if appt.google_event_id and old_cal and old_cal != new_cal:
        try:
            moved_event = (
                service.events()
                .move(
                    calendarId=old_cal,
                    eventId=appt.google_event_id,
                    destination=new_cal,
                )
                .execute()
            )
            new_event_id = moved_event.get("id")
            appt.google_event_id = new_event_id
            return True, "moved", new_event_id
        except Exception:
            pass

    ok, msg, eid = create_event_for_appointment(session, appt_id, target_friseur_id)
    return ok, msg, eid


def reschedule_appointment_and_sync(
    session, appointment_id: int, new_friseur_id: int, date_str: str, time_str: str
) -> Tuple[bool, str, Optional[str], List[str]]:
    """
    Reschedule an appointment to a new date/time (and possibly a new hairdresser) and sync Google Calendar.

    Steps:
      1) Validate the target slot using `get_free_slots_with_meta` (weekly template, exceptions, public holidays, FreeBusy).
      2) If the event remains in the same calendar, PATCH its start/end.
      3) If the calendar changes, insert a new event (and optionally delete the old one).
      4) Update the DB fields (friseur_id, date, time, google_event_id).

    Returns:
        (ok, message, event_id, suggested_slots_if_conflict)
        - ok: True when successfully rescheduled.
        - message: 'ok' or a reason key ('time_conflict', 'fully_booked', 'closed_weekly', ...).
        - event_id: Google event id when ok=True.
        - suggested_slots_if_conflict: slots list for the same date if ok=False due to conflict.
    """
    appt = session.execute(
        select(Appointment).where(Appointment.id == appointment_id).with_for_update()
    ).scalar_one_or_none()
    if not appt:
        return False, "appointment_not_found", None, []

    new_fr = session.get(Friseur, int(new_friseur_id))
    if not new_fr or not new_fr.calendar_id or new_fr.active is False:
        return False, "friseur_invalid_or_no_calendar", None, []

    svc = session.get(Service, appt.service_id)
    duration_min = getattr(svc, "duration_min", None) or getattr(svc, "duration", None)
    try:
        duration_min = int(duration_min) if duration_min is not None else None
    except Exception:
        duration_min = None
    if not duration_min or duration_min <= 0:
        return False, "service_duration_missing", None, []

    slots, reason = get_free_slots_with_meta(
        date_str=date_str,
        duration_min=duration_min,
        calendar_id=new_fr.calendar_id,
        friseur_id=int(new_friseur_id),
    )
    if time_str not in set(slots or []):
        return False, (reason or "time_conflict"), None, (slots or [])

    # Third-party (others)
    from dateutil import parser as _p

    new_date = _p.parse(date_str).date()
    new_time = datetime.strptime(time_str, "%H:%M").time()
    start_local = BERLIN_TZ.localize(datetime.combine(new_date, new_time))
    end_local = start_local + timedelta(minutes=int(duration_min))

    service = get_calendar_service()
    old_fr = session.get(Friseur, appt.friseur_id) if appt.friseur_id else None
    old_cal = getattr(old_fr, "calendar_id", None) if old_fr else None
    new_cal = new_fr.calendar_id

    new_event_id = None
    try:
        if appt.google_event_id and old_cal and old_cal == new_cal:
            service.events().patch(
                calendarId=new_cal,
                eventId=appt.google_event_id,
                body={
                    "start": {
                        "dateTime": start_local.isoformat(),
                        "timeZone": "Europe/Berlin",
                    },
                    "end": {
                        "dateTime": end_local.isoformat(),
                        "timeZone": "Europe/Berlin",
                    },
                    "description": f"Reservation: {appt.reservation_code}\nPhone: {appt.phone}\nFriseur: {new_fr.name}\n",
                },
            ).execute()
            new_event_id = appt.google_event_id
        else:
            _old_date, _old_time = appt.date, appt.time
            appt.date, appt.time = new_date, new_time
            body = _compose_event_payload(
                appt, new_fr, getattr(svc, "name", None), int(duration_min)
            )
            created = service.events().insert(calendarId=new_cal, body=body).execute()
            new_event_id = created.get("id")

            try:
                if appt.google_event_id and old_cal and old_cal != new_cal:
                    service.events().delete(
                        calendarId=old_cal, eventId=appt.google_event_id
                    ).execute()
            except Exception:
                pass

        stmt = (
            update(Appointment)
            .where(Appointment.id == int(appointment_id))
            .values(
                friseur_id=int(new_friseur_id),
                date=new_date,
                time=new_time,
                google_event_id=new_event_id,
            )
        )
        result = session.execute(stmt)
        session.flush()
        # Verify fresh state
        fresh = session.get(Appointment, int(appointment_id))
        try:
            current_app.logger.debug(
                "RESCHEDULE DB UPDATE rows=%s → fresh: id=%s friseur_id=%s date=%s time=%s",
                getattr(result, "rowcount", "n/a"),
                fresh.id,
                fresh.friseur_id,
                fresh.date,
                fresh.time,
            )
        except Exception:
            pass

        return True, "ok", new_event_id, []
    except Exception as ge:
        session.rollback()
        return False, f"google_api_error:{ge}", None, []
