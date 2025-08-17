# friseurbot/utils/calendar_tools.py
from __future__ import annotations

from datetime import date as date_cls
from datetime import datetime, time, timedelta
from typing import List, Optional, Tuple

import pytz
from dateutil import parser

from friseurbot.entity import Friseur, FriseurException, FriseurWeeklyHour
from friseurbot.utils.auth_google import get_calendar_service
from friseurbot.utils.db.helper import get_setting
from friseurbot.utils.db.manager import db_manager

# ---- Constants / Defaults ----
BERLIN_TZ = pytz.timezone("Europe/Berlin")
DEFAULT_START = time(9, 0)  # 09:00
DEFAULT_END = time(18, 0)  # 18:00

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

# ---------------- Helpers: settings / times ----------------


def _parse_time_or_default(value: Optional[str], default: time) -> time:
    """Parse a 'HH:MM' string. Returns `default` if value is None or invalid."""
    if not value:
        return default
    try:
        return datetime.strptime(value, "%H:%M").time()
    except Exception:
        return default


def _is_day_off(d: date_cls) -> bool:
    """
    Return True if the given date is listed in `days_off` setting.
    This represents a **global day off** (system-wide closure).
    """
    days_str = get_setting("days_off") or ""
    if not days_str.strip():
        return False
    names = [s.strip().lower() for s in days_str.split(",") if s.strip()]
    daynums = {
        DAY_NAME_TO_NUM.get(n) for n in names if DAY_NAME_TO_NUM.get(n) is not None
    }
    return d.weekday() in daynums


def _clip_to_business_hours(d: date_cls) -> Tuple[datetime, datetime]:
    """
    Return business hour window for the given date based on global settings.
    Falls back to 09:00–18:00 if settings are invalid.
    """
    start_cfg = get_setting("business_hours_start")
    end_cfg = get_setting("business_hours_end")
    start_t = _parse_time_or_default(start_cfg, DEFAULT_START)
    end_t = _parse_time_or_default(end_cfg, DEFAULT_END)
    start_dt = BERLIN_TZ.localize(datetime.combine(d, start_t))
    end_dt = BERLIN_TZ.localize(datetime.combine(d, end_t))
    if end_dt <= start_dt:
        # Fallback to defaults if misconfigured
        start_dt = BERLIN_TZ.localize(datetime.combine(d, DEFAULT_START))
        end_dt = BERLIN_TZ.localize(datetime.combine(d, DEFAULT_END))
    return start_dt, end_dt


# ---------------- Helpers: interval algebra ----------------


def _subtract_blocks(
    windows: List[Tuple[datetime, datetime]],
    blocks: List[Tuple[datetime, datetime]],
) -> List[Tuple[datetime, datetime]]:
    """
    Subtract `blocks` (closed intervals) from working `windows` and return the remaining open windows.
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


# ---------------- Helpers: personal schedule ----------------


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

        base_windows = [
            (
                BERLIN_TZ.localize(datetime.combine(d, w.start_time)),
                BERLIN_TZ.localize(datetime.combine(d, w.end_time)),
            )
            for w in weekly
        ]

        # Collect CUSTOM blocks (closed intervals) to subtract
        custom_blocks: List[Tuple[datetime, datetime]] = []
        for ex in ex_list:
            t = getattr(ex, "type", None)
            tval = t.value if hasattr(t, "value") else t
            if tval == "CUSTOM" and ex.start_time and ex.end_time:
                custom_blocks.append(
                    (
                        BERLIN_TZ.localize(datetime.combine(d, ex.start_time)),
                        BERLIN_TZ.localize(datetime.combine(d, ex.end_time)),
                    )
                )

        return (
            _subtract_blocks(base_windows, custom_blocks)
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


def _gen_slots(
    free_intervals: List[Tuple[datetime, datetime]], duration_min: int
) -> List[str]:
    """
    Generate appointment slots (HH:MM) from free intervals.
    Slots are created in steps equal to `duration_min`.
    """
    dur = timedelta(minutes=duration_min)
    step = dur
    out: List[str] = []
    for fs, fe in free_intervals:
        t = fs.replace(second=0, microsecond=0)
        while t + dur <= fe:
            out.append(t.strftime("%H:%M"))
            t += step
    return out


# ---------------- Main: free slots ----------------


def get_free_slots(
    date_str: str,
    duration_min: int,
    calendar_id: Optional[str],
    friseur_id: Optional[int] = None,
) -> List[str]:
    """
    Compute free appointment slots for a given date and duration (Europe/Berlin).

    Behaviour:
      - Global `days_off` closes the day for everyone.
      - For a stylist:
          * OFF exception => closed all day.
          * CUSTOM exceptions => closed blocks to subtract from weekly windows.
          * Weekly rows define base windows.
          * No weekly & no exceptions => closed (no global fallback).
      - For non-stylist (friseur_id=None), use global business hours.
      - Google Calendar busy events are respected (per-window).
      - For today, past start times are filtered out.
      - Step equals the requested duration (no extra gaps).
    """
    if not isinstance(duration_min, int) or duration_min <= 0:
        return []

    try:
        d = parser.parse(date_str).date()
    except Exception:
        return []

    if _is_day_off(d):
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

    # Query Google Calendar busy intervals inside each window
    service = get_calendar_service()
    busy_all: List[Tuple[datetime, datetime]] = []

    for w_start, w_end in windows:
        res = (
            service.events()
            .list(
                calendarId=calendar_id,
                timeMin=w_start.isoformat(),
                timeMax=w_end.isoformat(),
                singleEvents=True,
                orderBy="startTime",
                timeZone="Europe/Berlin",
            )
            .execute()
        )
        items = res.get("items", [])
        for it in items:
            es, ee = _event_interval(it)
            clip = _clip_interval(es, ee, w_start, w_end)
            if clip:
                busy_all.append(clip)

    busy_merged = _merge_intervals(busy_all)

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

    # Generate slots at `duration_min` step
    slots = _gen_slots(free_windows, duration_min)

    # If today, drop past ones
    now_berlin = datetime.now(BERLIN_TZ)
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
