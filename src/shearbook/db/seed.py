"""Demo and first-run seed data. Contains no real salon or customer details."""

from __future__ import annotations

from datetime import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from shearbook.models import Service, Setting, Stylist, StylistWeeklyHour
from shearbook.settings_svc import DEFAULTS, clear_settings_cache

DEFAULT_SERVICES = [
    ("Men's haircut", 30, 1),
    ("Men's hair and beard", 45, 2),
    ("Women's wash and cut", 45, 3),
    ("Women's wash, cut and blow-dry", 60, 4),
    ("Women's blow-dry", 30, 5),
    ("Root colour", 60, 6),
    ("Full colour", 75, 7),
    ("Highlights / balayage", 120, 8),
]

DEFAULT_WEEKLY = {
    # Monday-Friday 09:00-13:00 and 14:00-18:00, Saturday 09:00-14:00
    0: [(time(9, 0), time(13, 0)), (time(14, 0), time(18, 0))],
    1: [(time(9, 0), time(13, 0)), (time(14, 0), time(18, 0))],
    2: [(time(9, 0), time(13, 0)), (time(14, 0), time(18, 0))],
    3: [(time(9, 0), time(13, 0)), (time(14, 0), time(18, 0))],
    4: [(time(9, 0), time(13, 0)), (time(14, 0), time(18, 0))],
    5: [(time(9, 0), time(14, 0))],
}


def seed_settings(session: Session) -> None:
    existing = {row.key for row in session.scalars(select(Setting)).all()}
    for key, value in DEFAULTS.items():
        if key not in existing:
            session.add(Setting(key=key, value=value))
    clear_settings_cache()


def seed_services(session: Session) -> list[Service]:
    existing = session.scalars(select(Service)).all()
    if existing:
        return list(existing)
    services = [
        Service(name=name, duration_min=duration, position=position)
        for name, duration, position in DEFAULT_SERVICES
    ]
    session.add_all(services)
    session.flush()
    return services


def seed_demo_stylist(session: Session, calendar) -> Stylist:
    existing = session.scalar(select(Stylist).limit(1))
    if existing:
        return existing
    stylist = Stylist(name="Alex", active=True)
    session.add(stylist)
    session.flush()
    stylist.calendar_id = calendar.create_calendar(f"ShearBook – {stylist.name}", "Europe/Berlin")
    for weekday, windows in DEFAULT_WEEKLY.items():
        for start, end in windows:
            session.add(
                StylistWeeklyHour(
                    stylist_id=stylist.id,
                    weekday=weekday,
                    start_time=start,
                    end_time=end,
                )
            )
    services = seed_services(session)
    stylist.services = list(services)
    session.flush()
    return stylist


def seed_all(session: Session, calendar=None) -> None:
    seed_settings(session)
    seed_services(session)
    if calendar is not None:
        seed_demo_stylist(session, calendar)
