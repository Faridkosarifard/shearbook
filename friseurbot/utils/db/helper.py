# friseurbot/utils/db/helper.py
from __future__ import annotations

# Standard library
from datetime import datetime
from datetime import timedelta
from typing import List
from typing import Optional

# Third-party (others)
from googleapiclient.discovery import build

# SQLAlchemy
from sqlalchemy.exc import SQLAlchemyError

# Friseurbot
from friseurbot.entity import Appointment
from friseurbot.entity import Customer
from friseurbot.entity import Service
from friseurbot.entity import Setting
from friseurbot.utils.auth_google import get_credentials
from friseurbot.utils.db.manager import db_manager

# ------------------------------
# Internal helpers
# ------------------------------


def _get_calendar():
    """Build and return a Google Calendar service client."""
    creds = get_credentials()
    return build("calendar", "v3", credentials=creds)


# ------------------------------
# Customer helpers
# ------------------------------


def save_customer(name: str, phone: str) -> None:
    """
    Create a Customer record.

    Notes:
        - If you want to prevent duplicates, enforce a UNIQUE constraint
          on (phone) at the ORM/model level and catch IntegrityError here.
    """
    session = db_manager.get_session()
    try:
        customer = Customer(name=name, phone=phone)
        session.add(customer)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        db_manager.close()


# ------------------------------
# Service helpers
# ------------------------------


def get_all_services() -> List[Service]:
    """Return all services ordered by position."""
    session = db_manager.get_session()
    try:
        services = session.query(Service).order_by(Service.position).all()
        return services
    finally:
        db_manager.close()


# ------------------------------
# Appointment helpers
# ------------------------------


def save_appointment(
    name: str,
    phone: str,
    service_id: int,
    date,
    time,
    reservation_code: str,
    google_event_id: Optional[str],
    friseur_id: Optional[int],
) -> None:
    """
    Persist a newly created appointment.

    Args:
        date: a datetime.date
        time: a datetime.time
        google_event_id: calendar event id from Google, if created
        friseur_id: optional stylist id (links to calendar_id)
    """
    session = db_manager.get_session()
    try:
        appointment = Appointment(
            name=name,
            phone=phone,
            service_id=service_id,
            date=date,
            time=time,
            reservation_code=reservation_code,
            google_event_id=google_event_id,
            friseur_id=friseur_id,
        )
        session.add(appointment)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        db_manager.close()


def update_appointment_by_code(code: str, new_date: str, new_time: str) -> bool:
    """
    Update an existing appointment (by reservation code) to a new date/time.
    Also updates the Google Calendar event:
        - If an old event exists, delete it.
        - Create a new event with updated times.

    Args:
        code: reservation code, e.g. "KR-0415-1234"
        new_date: "YYYY-MM-DD"
        new_time: "HH:MM"

    Returns:
        True if updated, False if appointment or its service was not found.
    """
    session = db_manager.get_session()
    try:
        appt = session.query(Appointment).filter_by(reservation_code=code).first()
        if not appt:
            return False

        service = session.query(Service).filter_by(id=appt.service_id).first()
        if not service:
            return False

        # Build calendar client (used below regardless of whether we delete old or just insert new)
        calendar = _get_calendar()

        # Remove old event if exists
        if appt.google_event_id:
            try:
                calendar.events().delete(
                    calendarId=appt.friseur.calendar_id, eventId=appt.google_event_id
                ).execute()
            except Exception:
                # We continue even if the old event cannot be deleted (stale id, etc.)
                pass

        # Compute new start/end based on service duration
        start_dt = datetime.fromisoformat(f"{new_date}T{new_time}")
        end_dt = start_dt + timedelta(minutes=service.duration_min or 60)

        event = {
            "summary": f"{service.name} – {appt.name}",
            "description": f"Tel: {appt.phone}",
            "start": {"dateTime": start_dt.isoformat(), "timeZone": "Europe/Berlin"},
            "end": {"dateTime": end_dt.isoformat(), "timeZone": "Europe/Berlin"},
        }

        # Create new calendar event
        event_new = (
            calendar.events()
            .insert(
                calendarId=appt.friseur.calendar_id,
                body=event,
            )
            .execute()
        )

        # Persist DB changes
        appt.date = start_dt.date()
        appt.time = start_dt.time()
        appt.google_event_id = event_new.get("id")
        session.commit()
        return True
    except Exception:
        session.rollback()
        raise
    finally:
        db_manager.close()


def get_all_appointments() -> List[Appointment]:
    """Return all appointments."""
    session = db_manager.get_session()
    try:
        return session.query(Appointment).all()
    finally:
        db_manager.close()


def delete_appointment_by_code(code: str) -> bool:
    """
    Delete an appointment (and corresponding Google Calendar event if present).

    Returns:
        True if deleted, False if code not found.
    """
    session = db_manager.get_session()
    try:
        appt = session.query(Appointment).filter_by(reservation_code=code).first()
        if not appt:
            return False

        # Delete Google Calendar event if present
        if appt.google_event_id:
            try:
                calendar = _get_calendar()
                calendar.events().delete(
                    calendarId=appt.friseur.calendar_id, eventId=appt.google_event_id
                ).execute()
            except Exception:
                # Non-fatal: continue to remove DB row
                pass

        session.delete(appt)
        session.commit()
        return True
    except Exception:
        session.rollback()
        raise
    finally:
        db_manager.close()


# ------------------------------
# Settings helpers
# ------------------------------


def get_setting(key: str) -> Optional[str]:
    """
    Return the setting value for a given key, or None if not found.
    """
    session = db_manager.get_session()
    try:
        setting = session.query(Setting).filter_by(key=key).first()
        return setting.value if setting else None
    finally:
        db_manager.close()
