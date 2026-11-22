"""Create, change, and cancel appointments, keeping the calendar in sync."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from shearbook.availability import appointment_interval, slot_is_free
from shearbook.calendar.factory import get_calendar
from shearbook.codes import generate_unique_reservation_code
from shearbook.models import Appointment, Blacklist, Customer, Service, Stylist
from shearbook.phones import normalize_phone
from shearbook.timeutil import hhmm, localize, zone


class BookingError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def _cfg_kwargs(config: dict) -> dict:
    return {
        "tz_name": config.get("TIMEZONE", "Europe/Berlin"),
        "holiday_country": config.get("HOLIDAY_COUNTRY", "DE"),
        "holiday_region": config.get("HOLIDAY_REGION", ""),
        "slot_step_min": int(config.get("SLOT_STEP_MIN", 30)),
    }


def upsert_customer(session: Session, name: str, phone: str) -> Customer:
    phone = normalize_phone(phone)
    if not phone:
        raise BookingError("phone is required")
    row = session.scalar(select(Customer).where(Customer.phone == phone))
    if row:
        if name and row.name != name:
            row.name = name
        return row
    row = Customer(name=name.strip(), phone=phone)
    session.add(row)
    session.flush()
    return row


def is_blacklisted(session: Session, phone: str) -> bool:
    phone = normalize_phone(phone)
    if not phone:
        return False
    return session.scalar(select(Blacklist).where(Blacklist.phone == phone)) is not None


def _event_copy(appt: Appointment, service: Service, start: datetime, end: datetime, tz_name: str):
    summary = f"{service.name} – {appt.name}"
    description = f"Tel: {appt.phone}\nCode: {appt.reservation_code}"
    return summary, description, start, end, tz_name


def create_appointment(
    session: Session,
    config: dict,
    *,
    name: str,
    phone: str,
    service_id: int,
    start: datetime,
    stylist_id: int,
    skip_availability: bool = False,
) -> Appointment:
    name = (name or "").strip()
    phone = normalize_phone(phone)
    if not name or not phone or not service_id or not stylist_id:
        raise BookingError("missing data")
    if is_blacklisted(session, phone):
        raise BookingError("blacklisted", 403)

    service = session.get(Service, int(service_id))
    if not service:
        raise BookingError("service_not_found", 404)
    stylist = session.get(Stylist, int(stylist_id))
    if not stylist or not stylist.calendar_id:
        raise BookingError("stylist_not_found", 404)
    if not stylist.active:
        raise BookingError("stylist_inactive")

    tz_name = config.get("TIMEZONE", "Europe/Berlin")
    if start.tzinfo is None:
        start = start.replace(tzinfo=zone(tz_name))
    else:
        start = start.astimezone(zone(tz_name))
    end = start + timedelta(minutes=service.duration_min)

    calendar = get_calendar(session)
    kwargs = _cfg_kwargs(config)
    if not skip_availability and not slot_is_free(
        session,
        calendar,
        start.date().isoformat(),
        start.strftime("%H:%M"),
        service.duration_min,
        stylist.id,
        calendar_id=stylist.calendar_id,
        **kwargs,
    ):
        raise BookingError("slot_unavailable", 409)

    upsert_customer(session, name, phone)
    code = generate_unique_reservation_code(
        session, prefix=config.get("RESERVATION_PREFIX", "SB"), on=start.date()
    )
    appt = Appointment(
        reservation_code=code,
        name=name,
        phone=phone,
        service_id=service.id,
        date=start.date(),
        time=start.time().replace(second=0, microsecond=0),
        stylist_id=stylist.id,
    )
    session.add(appt)
    session.flush()
    summary, description, *_ = _event_copy(appt, service, start, end, tz_name)
    appt.calendar_event_id = calendar.create_event(
        stylist.calendar_id, summary, description, start, end, tz_name
    )
    session.flush()
    return appt


def appointment_by_code(session: Session, code: str) -> Appointment | None:
    return session.scalar(
        select(Appointment)
        .options(joinedload(Appointment.service), joinedload(Appointment.stylist))
        .where(Appointment.reservation_code == code)
    )


def cancel_appointment(session: Session, config: dict, code: str) -> bool:
    appt = appointment_by_code(session, code)
    if not appt:
        return False
    calendar = get_calendar(session)
    if appt.calendar_event_id and appt.stylist and appt.stylist.calendar_id:
        calendar.delete_event(appt.stylist.calendar_id, appt.calendar_event_id)
    session.delete(appt)
    session.flush()
    return True


def update_appointment_time(
    session: Session,
    config: dict,
    code: str,
    new_date: str,
    new_time: str,
) -> Appointment:
    appt = appointment_by_code(session, code)
    if not appt or not appt.service or not appt.stylist:
        raise BookingError("not_found", 404)
    tz_name = config.get("TIMEZONE", "Europe/Berlin")
    try:
        day = date.fromisoformat(new_date)
        t = time.fromisoformat(new_time)
    except ValueError as exc:
        raise BookingError("invalid_datetime") from exc
    start = localize(day, t, tz_name)
    duration = appt.service.duration_min
    calendar = get_calendar(session)
    kwargs = _cfg_kwargs(config)
    old_cal = appt.stylist.calendar_id
    ignore = appointment_interval(appt.date, appt.time, duration, tz_name)
    if not slot_is_free(
        session,
        calendar,
        day.isoformat(),
        t.strftime("%H:%M"),
        duration,
        appt.stylist_id,
        calendar_id=old_cal,
        ignore=ignore,
        **kwargs,
    ):
        raise BookingError("slot_unavailable", 409)
    end = start + timedelta(minutes=duration)
    summary, description, *_ = _event_copy(appt, appt.service, start, end, tz_name)
    appt.date = day
    appt.time = t
    if appt.calendar_event_id and old_cal:
        appt.calendar_event_id = calendar.update_event(
            old_cal, appt.calendar_event_id, summary, description, start, end, tz_name
        )
    else:
        appt.calendar_event_id = calendar.create_event(
            old_cal, summary, description, start, end, tz_name
        )
    session.flush()
    return appt


def reschedule_appointment(
    session: Session,
    config: dict,
    appointment_id: int,
    *,
    new_date: str,
    new_time: str,
    new_stylist_id: int | None = None,
) -> Appointment:
    appt = session.get(Appointment, appointment_id)
    if not appt:
        raise BookingError("not_found", 404)
    service = session.get(Service, appt.service_id)
    old_stylist = session.get(Stylist, appt.stylist_id)
    if not service or not old_stylist:
        raise BookingError("not_found", 404)
    target = old_stylist
    if new_stylist_id is not None and int(new_stylist_id) != appt.stylist_id:
        found = session.get(Stylist, int(new_stylist_id))
        if not found or not found.calendar_id:
            raise BookingError("stylist_not_found", 404)
        target = found
    tz_name = config.get("TIMEZONE", "Europe/Berlin")
    try:
        day = date.fromisoformat(new_date)
        t = time.fromisoformat(new_time)
    except ValueError as exc:
        raise BookingError("invalid_datetime") from exc
    start = localize(day, t, tz_name)
    calendar = get_calendar(session)
    ignore = appointment_interval(appt.date, appt.time, service.duration_min, tz_name)
    if not slot_is_free(
        session,
        calendar,
        day.isoformat(),
        t.strftime("%H:%M"),
        service.duration_min,
        target.id,
        calendar_id=target.calendar_id,
        ignore=ignore if target.id == old_stylist.id else None,
        **_cfg_kwargs(config),
    ):
        raise BookingError("slot_unavailable", 409)
    end = start + timedelta(minutes=service.duration_min)
    summary, description, *_ = _event_copy(appt, service, start, end, tz_name)
    if appt.calendar_event_id and old_stylist.calendar_id:
        if target.id == old_stylist.id:
            appt.calendar_event_id = calendar.update_event(
                target.calendar_id,
                appt.calendar_event_id,
                summary,
                description,
                start,
                end,
                tz_name,
            )
        else:
            appt.calendar_event_id = calendar.move_event(
                appt.calendar_event_id,
                old_stylist.calendar_id,
                target.calendar_id,
                summary,
                description,
                start,
                end,
                tz_name,
            )
    else:
        appt.calendar_event_id = calendar.create_event(
            target.calendar_id, summary, description, start, end, tz_name
        )
    appt.date = day
    appt.time = t
    appt.stylist_id = target.id
    session.flush()
    return appt


def serialize_appointment(appt: Appointment) -> dict:
    return {
        "id": appt.id,
        "name": appt.name,
        "phone": appt.phone,
        "service": appt.service.name if appt.service else None,
        "service_id": appt.service_id,
        "duration": appt.service.duration_min if appt.service else None,
        "date": appt.date.isoformat(),
        "time": hhmm(appt.time),
        "reservation_code": appt.reservation_code,
        "stylist_id": appt.stylist_id,
        "stylist_name": appt.stylist.name if appt.stylist else None,
        "calendar_id": appt.stylist.calendar_id if appt.stylist else None,
    }
