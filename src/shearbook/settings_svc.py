"""Salon settings stored as key/value rows, with a short process cache."""

from __future__ import annotations

from datetime import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from shearbook.models import Setting
from shearbook.timeutil import parse_hhmm

_cache: dict[str, str] | None = None

DEFAULTS: dict[str, str] = {
    "salon_name": "Your Salon",
    "business_hours_start": "09:00",
    "business_hours_end": "18:00",
    "days_off": "Sunday",
    "booking_text": (
        "Your appointment is confirmed.\n"
        "{service}\n{date} at {time}\n"
        "{name}\nReservation code: {code}"
    ),
    "cancel_text": "Your appointment has been cancelled.",
    "welcome_text": "Welcome! How can I help you today?",
    "help_message": "",
    "reminder_text": "Reminder: you have an appointment tomorrow at {time} for {service}.",
    "enable_auto_reminder": "true",
    "reminder_time": "09:00",
    "reminder_lead_days": "1",
    "instagram_link": "",
    "google_review_link": "",
    "email_contact": "",
    "location_address": "",
    "whatsapp_support_link": "",
    "send_address_enabled": "false",
    "send_instagram_google_enabled": "false",
    "select_stylist_enabled": "true",
}


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


def clear_settings_cache() -> None:
    global _cache
    _cache = None


def load_settings(session: Session) -> dict[str, str]:
    global _cache
    if _cache is not None:
        return dict(_cache)
    rows = session.scalars(select(Setting)).all()
    data = dict(DEFAULTS)
    data.update({row.key: row.value for row in rows})
    _cache = data
    return dict(data)


def get_setting(session: Session, key: str, default: str | None = None) -> str | None:
    all_settings = load_settings(session)
    if key in all_settings:
        return all_settings[key]
    return default


def upsert_settings(session: Session, values: dict[str, str]) -> dict[str, str]:
    for key, value in values.items():
        if not isinstance(key, str) or not key.strip():
            raise ValueError("invalid key")
        key = key.strip()
        stored = value if value is None else str(value)
        row = session.get(Setting, key)
        if row:
            row.value = stored
        else:
            session.add(Setting(key=key, value=stored))
    session.flush()
    clear_settings_cache()
    return load_settings(session)


def delete_setting(session: Session, key: str) -> bool:
    row = session.get(Setting, key)
    if not row:
        return False
    session.delete(row)
    session.flush()
    clear_settings_cache()
    return True


def days_off(session: Session) -> set[int]:
    raw = (get_setting(session, "days_off") or "").strip()
    if not raw:
        return set()
    names = [part.strip().lower() for part in raw.split(",") if part.strip()]
    return {DAY_NAME_TO_NUM[name] for name in names if name in DAY_NAME_TO_NUM}


def business_hours(session: Session) -> tuple[time, time]:
    start = parse_hhmm(get_setting(session, "business_hours_start"), time(9, 0))
    end = parse_hhmm(get_setting(session, "business_hours_end"), time(18, 0))
    assert start is not None and end is not None
    if end <= start:
        return time(9, 0), time(18, 0)
    return start, end
