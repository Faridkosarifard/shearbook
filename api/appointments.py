import datetime

from flask import Blueprint, jsonify, request
from googleapiclient.discovery import build
from sqlalchemy.orm import joinedload

from entity import User
from entity.appointment import Appointment
from entity.services import Service
from utils.auth_google import get_credentials
from utils.db import (
    SessionLocal,
    delete_appointment_by_code,
    save_appointment,
    save_customer,
    update_appointment_by_code,
)
from utils.reservation_code import generate_reservation_code

appointments_api = Blueprint("appointments", __name__)


@appointments_api.route("/create-event", methods=["POST"])
def create_event():
    data = request.json
    name = data.get("name")
    phone = data.get("phone")
    service_id = data.get("service_id")
    start_str = data.get("start")
    calendar_id = data.get("calendar_id")
    friseur_id = data.get("friseur_id")

    if not all([name, phone, service_id, start_str]):
        return jsonify({"status": "error", "message": "missing data"}), 400

    session = SessionLocal()
    try:
        service = session.query(Service).filter_by(id=service_id).first()
        if not service:
            return jsonify({"status": "error", "message": "Service not found"}), 404

        duration = service.duration_min
        start = datetime.datetime.fromisoformat(start_str)
        end = start + datetime.timedelta(minutes=duration)

        creds = get_credentials()
        calendar = build("calendar", "v3", credentials=creds)

        event = {
            "summary": f"{service.name} – {name}",
            "description": f"Tel: {phone}",
            "start": {"dateTime": start.isoformat(), "timeZone": "Europe/Berlin"},
            "end": {"dateTime": end.isoformat(), "timeZone": "Europe/Berlin"},
        }

        event_created = (
            calendar.events().insert(calendarId=calendar_id, body=event).execute()
        )
        event_id = event_created["id"]

        reservation_code = generate_reservation_code()

        save_appointment(
            name=name,
            phone=phone,
            service_id=service_id,
            date=start.date(),
            time=start.time(),
            reservation_code=reservation_code,
            google_event_id=event_id,
            friseur_id=friseur_id,
        )

        return jsonify({"status": "ok", "reservation_code": reservation_code})

    except Exception as e:
        print("❌ Fehler beim Erstellen des Termins:", e)
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        session.close()


@appointments_api.route("/save-customer", methods=["POST"])
def save_customer_api():
    data = request.json
    name = data.get("name")
    phone = data.get("phone")

    if not name or not phone:
        return jsonify({"status": "error", "message": "name and phone required"}), 400

    try:
        save_customer(name, phone)
        return jsonify({"status": "ok", "message": "saved"})
    except Exception as e:
        print("❌ Fehler beim Speichern des Kunden:", e)
        return jsonify({"status": "error", "message": str(e)}), 500


@appointments_api.route("/appointments", methods=["GET"])
def get_appointments():
    session = SessionLocal()
    try:
        appointments = (
            session.query(Appointment).options(joinedload(Appointment.service)).all()
        )

        return jsonify(
            [
                {
                    "name": a.name,
                    "phone": a.phone,
                    "service": a.service.name,
                    "duration": a.service.duration_min,
                    "date": a.date.isoformat(),
                    "time": a.time.strftime("%H:%M"),
                    "reservation_code": a.reservation_code,
                }
                for a in appointments
            ]
        )
    except Exception as e:
        print("❌ Fehler beim Abrufen der Termine:", e)
        return jsonify({"status": "error", "message": str(e)})
    finally:
        session.close()


@appointments_api.route("/cancel-reservation/<code>", methods=["DELETE"])
def cancel_reservation(code):
    try:
        success = delete_appointment_by_code(code)
        if success:
            return jsonify({"status": "ok", "message": "Termin wurde storniert."})
        else:
            return (
                jsonify(
                    {
                        "status": "not_found",
                        "message": "Reservierungscode nicht gefunden.",
                    }
                ),
                404,
            )
    except Exception as e:
        print("error with cancelation:", e)
        return jsonify({"status": "error", "message": str(e)}), 500


@appointments_api.route("/update-reservation/<code>", methods=["PUT"])
def update_reservation(code):
    data = request.json
    new_date = data.get("new_date")
    new_time = data.get("new_time")

    if not new_date or not new_time:
        return jsonify({"status": "error", "message": "missing date or time"}), 400

    try:
        success = update_appointment_by_code(code, new_date, new_time)
        if success:
            return jsonify({"status": "ok", "message": "Termin aktualisiert"})
        else:
            return (
                jsonify(
                    {
                        "status": "not_found",
                        "message": "Reservierungscode nicht gefunden",
                    }
                ),
                404,
            )
    except Exception as e:
        print("❌ Fehler beim Aktualisieren:", e)
        return jsonify({"status": "error", "message": str(e)}), 500


@appointments_api.route("/appointment/<code>", methods=["GET"])
def get_single_appointment(code):
    session = SessionLocal()
    try:
        appt = session.query(Appointment).filter_by(reservation_code=code).first()
        if not appt:
            return jsonify({"status": "not_found"}), 404

        service = session.query(Service).filter_by(id=appt.service_id).first()
        if not service:
            return jsonify({"status": "error", "message": "Service not found"}), 500

        return jsonify(
            {
                "service_id": appt.service_id,
                "service_name": service.name,
                "duration": service.duration_min,
                "date": appt.date.isoformat(),
                "time": appt.time.strftime("%H:%M"),
                "name": appt.name,
                "phone": appt.phone,
                "calendar_id": appt.friseur.calendar_id,
            }
        )
    finally:
        session.close()


@appointments_api.route("/appointment/change/<code>", methods=["GET"])
def get_veryfication(code):
    session = SessionLocal()
    phone = request.args.get("phone")

    appt = session.query(Appointment).filter_by(reservation_code=code).first()
    if not appt:
        return jsonify({"status": "not_found"}), 404

    service = session.query(Service).filter_by(id=appt.service_id).first()
    if not service:
        return jsonify({"status": "error", "message": "Service not found"}), 500

    if phone and appt.phone != phone:
        return jsonify({"status": "unauthorized"}), 403

    return jsonify(
        {
            "status": "ok",
            "code": appt.reservation_code,
            "service_id": appt.service_id,
            "service_name": service.name,
            "duration": service.duration_min,
            "date": appt.date.isoformat(),
            "time": appt.time.strftime("%H:%M"),
            "name": appt.name,
            "phone": appt.phone,
        }
    )
