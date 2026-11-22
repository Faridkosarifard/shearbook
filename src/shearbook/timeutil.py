"""Timezone and time-string helpers."""

from __future__ import annotations

from datetime import date, datetime, time
from zoneinfo import ZoneInfo


def zone(name: str) -> ZoneInfo:
    return ZoneInfo(name)


def now_tz(tz_name: str) -> datetime:
    return datetime.now(zone(tz_name)).replace(microsecond=0)


def localize(d: date, t: time, tz_name: str) -> datetime:
    return datetime.combine(d, t, tzinfo=zone(tz_name))


def parse_hhmm(value: str | time | None, default: time | None = None) -> time | None:
    if value is None or value == "":
        return default
    if isinstance(value, time):
        return value.replace(second=0, microsecond=0)
    text = str(value).strip()
    for fmt in ("%H:%M", "%H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).time().replace(second=0, microsecond=0)
        except ValueError:
            continue
    parts = text.split(":")
    if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
        return time(int(parts[0]), int(parts[1]))
    if default is not None:
        return default
    raise ValueError(f"Invalid time: {value!r}")


def hhmm(value: time | datetime | str) -> str:
    if isinstance(value, datetime):
        return value.strftime("%H:%M")
    if isinstance(value, time):
        return value.strftime("%H:%M")
    parsed = parse_hhmm(value)
    if parsed is None:
        raise ValueError(f"Invalid time: {value!r}")
    return parsed.strftime("%H:%M")
