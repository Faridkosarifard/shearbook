from datetime import datetime, timedelta

from googleapiclient.discovery import build
from sqlalchemy.orm import sessionmaker

from entity import Appointment, Customer, Service
from entity.base import engine
from entity.setting import Setting
from utils.auth_google import get_credentials

SessionLocal = sessionmaker(bind=engine)


def save_customer(name, phone):
    session = SessionLocal()
    try:
        customer = Customer(name=name, phone=phone)
        session.add(customer)
        session.commit()
    except Exception as e:
        session.rollback()
        raise e
    finally:
        session.close()


def get_all_services():
    session = SessionLocal()
    try:
        services = session.query(Service).order_by(Service.position).all()
        return services
    finally:
        session.close()


def save_appointment(
    name, phone, service_id, date, time, reservation_code, google_event_id, friseur_id
):
    session = SessionLocal()
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
    except Exception as e:
        session.rollback()
        raise e
    finally:
        session.close()


def update_appointment_by_code(code, new_date, new_time):
    session = SessionLocal()
    try:
        appt = session.query(Appointment).filter_by(reservation_code=code).first()
        if not appt:
            return False

        service = session.query(Service).filter_by(id=appt.service_id).first()
        if not service:
            return False

        if appt.google_event_id:
            creds = get_credentials()
            calendar = build("calendar", "v3", credentials=creds)
            calendar.events().delete(
                calendarId=appt.friseur.calendar_id, eventId=appt.google_event_id
            ).execute()

        start = datetime.fromisoformat(f"{new_date}T{new_time}")
        end = start + timedelta(minutes=60)

        event = {
            "summary": f"{service.name} – {appt.name}",
            "description": f"Tel: {appt.phone}",
            "start": {"dateTime": start.isoformat(), "timeZone": "Europe/Berlin"},
            "end": {"dateTime": end.isoformat(), "timeZone": "Europe/Berlin"},
        }

        event_new = (
            calendar.events()
            .insert(calendarId=appt.friseur.calendar_id, body=event)
            .execute()
        )

        appt.date = start.date()
        appt.time = start.time()
        appt.google_event_id = event_new["id"]

        session.commit()
        return True
    except Exception as e:
        session.rollback()
        raise e
    finally:
        session.close()


def get_all_appointments():
    session = SessionLocal()
    try:
        return session.query(Appointment).all()
    finally:
        session.close()


def delete_appointment_by_code(code):
    session = SessionLocal()
    try:
        appt = session.query(Appointment).filter_by(reservation_code=code).first()
        if appt:
            if appt.google_event_id:
                creds = get_credentials()
                calendar = build("calendar", "v3", credentials=creds)
                calendar.events().delete(
                    calendarId=appt.friseur.calendar_id, eventId=appt.google_event_id
                ).execute()

            session.delete(appt)
            session.commit()
            return True
        return False
    except Exception as e:
        session.rollback()
        raise e
    finally:
        session.close()


def get_setting(key):
    session = SessionLocal()
    setting = session.query(Setting).filter_by(key=key).first()
    session.close()
    if setting:
        return setting.value
    return None
