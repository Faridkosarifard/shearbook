import datetime

from flask import Blueprint, jsonify, request
from googleapiclient.discovery import build
from sqlalchemy.orm import joinedload

from friseurbot.entity.appointment import Appointment
from friseurbot.entity.services import Service
from friseurbot.security import (
    has_valid_bot_token,
    is_admin_cookie_valid,
    require_admin,
    require_bot_or_admin,
    require_csrf,
)
from friseurbot.utils.auth_google import get_credentials
from friseurbot.utils.db.helper import (
    delete_appointment_by_code,
    save_appointment,
    save_customer,
    update_appointment_by_code,
)
from friseurbot.utils.db.manager import db_manager
from friseurbot.utils.reservation_code import generate_unique_reservation_code

appointments_api = Blueprint("appointments", __name__)

"""
Blueprint: Appointments
-----------------------
Endpoints for creating, listing, updating, and deleting appointments, plus
auxiliary actions like saving a customer entry or verifying a reservation code.

Security decorators:
- @require_bot_or_admin: Allows requests from the Bot (header) or Admin (cookie).
- @require_admin: Admin-only endpoints.
- @require_csrf: Requires a valid CSRF token (used for state-changing operations).

Google Calendar:
- Calendar events are created via the official Google Calendar API (v3).
- Credentials are provided by friseurbot.utils.auth_google.get_credentials().
"""


@appointments_api.route("/create-event", methods=["POST"])
@require_bot_or_admin
@require_csrf
def create_event():
    """
    Create a Google Calendar event and persist an Appointment row.

    Request (JSON):
      - name (str)        : Customer full name (required)
      - phone (str)       : Customer phone number (required)
      - service_id (int)  : ID of the selected service (required)
      - start (str)       : ISO datetime string for the appointment start (required)
      - calendar_id (str) : Google Calendar ID of the stylist (required)
      - friseur_id (int)  : Internal stylist ID (required)

    Behavior:
      1) Validates required fields and the 'start' ISO datetime.
      2) Reads the service to determine duration (minutes).
      3) Creates the Google Calendar event using start/end times.
      4) Generates a unique reservation code and saves the appointment in DB.

    Responses:
      200: {"status": "ok", "reservation_code": "<CODE>"}
      400: {"status": "error", "message": "missing data" | "invalid start datetime"}
      404: {"status": "error", "message": "Service not found"}
      500: {"status": "error", "message": "<error>"} on unexpected failures.
    """
    data = request.json or {}
    name = data.get("name")
    phone = data.get("phone")
    service_id = data.get("service_id")
    start_str = data.get("start")
    calendar_id = data.get("calendar_id")
    friseur_id = data.get("friseur_id")

    if not all([name, phone, service_id, start_str, calendar_id, friseur_id]):
        return jsonify({"status": "error", "message": "missing data"}), 400

    session = db_manager.get_session()
    try:
        service = session.query(Service).filter_by(id=service_id).first()
        if not service:
            return jsonify({"status": "error", "message": "Service not found"}), 404

        # Validate ISO datetime for 'start'
        try:
            start = datetime.datetime.fromisoformat(start_str)
        except Exception:
            return jsonify({"status": "error", "message": "invalid start datetime"}), 400

        duration = service.duration_min
        end = start + datetime.timedelta(minutes=duration)

        # Create Google Calendar event
        creds = get_credentials()
        calendar = build("calendar", "v3", credentials=creds)
        event = {
            "summary": f"{service.name} – {name}",
            "description": f"Tel: {phone}",
            "start": {"dateTime": start.isoformat(), "timeZone": "Europe/Berlin"},
            "end": {"dateTime": end.isoformat(), "timeZone": "Europe/Berlin"},
        }
        event_created = calendar.events().insert(calendarId=calendar_id, body=event).execute()
        event_id = event_created["id"]

        # Generate reservation code and persist to DB
        reservation_code = generate_unique_reservation_code(prefix="KR", session=session)

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
        # Keep server logs for diagnostics; client receives a clean error payload
        print("❌ Fehler beim Erstellen des Termins:", e)
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()


@appointments_api.route("/save-customer", methods=["POST"])
@require_bot_or_admin
@require_csrf
def save_customer_api():
    """
    Persist/update a customer record (name, phone).

    Request (JSON):
      - name (str)  : required
      - phone (str) : required

    Responses:
      200: {"status": "ok", "message": "saved"}
      400: {"status": "error", "message": "name and phone required"}
      500: {"status": "error", "message": "<error>"} on unexpected failures.
    """
    data = request.json or {}
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
@require_admin
def get_appointments():
    """
    Admin-only list of all appointments with joined service and stylist info.

    Responses:
      200: JSON array of appointments:
           [{
             "id": int,
             "name": str,
             "phone": str,
             "service": str | null,
             "duration": int | null,          # minutes
             "date": "YYYY-MM-DD",
             "time": "HH:MM",
             "reservation_code": str,
             "friseur_id": int | null,
             "friseur_name": str | null,
             "calendar_id": str | null
           }, ...]
      500: {"status": "error", "message": "<error>"} on unexpected failures.
    """
    session = db_manager.get_session()
    try:
        appointments = (
            session.query(Appointment)
            .options(
                joinedload(Appointment.service),
                joinedload(Appointment.friseur),
            )
            .all()
        )
        return jsonify(
            [
                {
                    "id": a.id,
                    "name": a.name,
                    "phone": a.phone,
                    "service": a.service.name if a.service else None,
                    "duration": a.service.duration_min if a.service else None,
                    "date": a.date.isoformat(),
                    "time": a.time.strftime("%H:%M"),
                    "reservation_code": a.reservation_code,
                    "friseur_id": a.friseur.id if a.friseur else None,
                    "friseur_name": a.friseur.name if a.friseur else None,
                    "calendar_id": a.friseur.calendar_id if a.friseur else None,
                }
                for a in appointments
            ]
        )
    except Exception as e:
        print("❌ Fehler beim Abrufen der Termine:", e)
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()


@appointments_api.route("/cancel-reservation/<code>", methods=["DELETE"])
@require_bot_or_admin
@require_csrf
def cancel_reservation(code):
    """
    Cancel an appointment by its reservation code.

    Path params:
      - code (str): Reservation code.

    Security:
      - Bot or Admin required + CSRF token.

    Responses:
      200: {"status": "ok", "message": "Termin wurde storniert."}
      404: {"status": "not_found", "message": "Reservierungscode nicht gefunden."}
      500: {"status": "error", "message": "<error>"} on unexpected failures.
    """
    try:
        success = delete_appointment_by_code(code)
        if success:
            return jsonify({"status": "ok", "message": "Termin wurde storniert."})
        else:
            return jsonify({"status": "not_found", "message": "Reservierungscode nicht gefunden."}), 404
    except Exception as e:
        print("error with cancelation:", e)
        return jsonify({"status": "error", "message": str(e)}), 500


@appointments_api.route("/update-reservation/<code>", methods=["PUT"])
@require_bot_or_admin
@require_csrf
def update_reservation(code):
    """
    Update an appointment's date/time by reservation code.

    Path params:
      - code (str): Reservation code.

    Request (JSON):
      - new_date (str) : "YYYY-MM-DD" (required)
      - new_time (str) : "HH:MM" (required)

    Responses:
      200: {"status": "ok", "message": "Termin aktualisiert"}
      400: {"status": "error", "message": "missing date or time"}
      404: {"status": "not_found", "message": "Reservierungscode nicht gefunden"}
      500: {"status": "error", "message": "<error>"} on unexpected failures.
    """
    data = request.json or {}
    new_date = data.get("new_date")
    new_time = data.get("new_time")

    if not new_date or not new_time:
        return jsonify({"status": "error", "message": "missing date or time"}), 400

    try:
        success = update_appointment_by_code(code, new_date, new_time)
        if success:
            return jsonify({"status": "ok", "message": "Termin aktualisiert"})
        else:
            return jsonify({"status": "not_found", "message": "Reservierungscode nicht gefunden"}), 404
    except Exception as e:
        print("❌ Fehler beim Aktualisieren:", e)
        return jsonify({"status": "error", "message": str(e)}), 500


@appointments_api.route("/appointment/<code>", methods=["GET"])
def get_single_appointment(code):
    """
    Fetch a single appointment by reservation code.

    Authorization model:
      - If the request is made by Bot or Admin (valid header/cookie), return full details.
      - Otherwise (public client), 'phone' must be provided as a query param and match
        the stored number for the appointment; otherwise return 403.

    Query params (for public requests):
      - phone (str): Must match the appointment's phone number.

    Responses:
      200: {
            "service_id": int,
            "service_name": str,
            "duration": int,                 # minutes
            "date": "YYYY-MM-DD",
            "time": "HH:MM",
            "name": str,
            "phone": str,
            "calendar_id": str | null
           }
      403: {"status": "unauthorized"}
      404: {"status": "not_found"}
      500: {"status": "error", "message": "Service not found"} if service is missing.
    """
    session = db_manager.get_session()
    try:
        appt = session.query(Appointment).filter_by(reservation_code=code).first()
        if not appt:
            return jsonify({"status": "not_found"}), 404

        # Admin/Bot authorized?
        authorized = has_valid_bot_token() or is_admin_cookie_valid()

        # For public access, 'phone' must be provided and match
        if not authorized:
            phone = request.args.get("phone")
            if not phone or phone != appt.phone:
                return jsonify({"status": "unauthorized"}), 403

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
                "calendar_id": appt.friseur.calendar_id if appt.friseur else None,
            }
        )
    finally:
        db_manager.close()


@appointments_api.route("/appointment/change/<code>", methods=["GET"])
def get_verification(code):
    """
    Verify a reservation code and return basic appointment details.

    Authorization model:
      - If the request is made by Bot or Admin, return details.
      - Otherwise (public), 'phone' query param must match the stored phone number;
        if not, respond with 403.

    Query params (for public requests):
      - phone (str): Must match the appointment's phone number.

    Responses:
      200: {
            "status": "ok",
            "code": str,
            "service_id": int,
            "service_name": str,
            "duration": int,              # minutes
            "date": "YYYY-MM-DD",
            "time": "HH:MM",
            "name": str,
            "phone": str
           }
      403: {"status": "unauthorized"}
      404: {"status": "not_found"}
      500: {"status": "error", "message": "Service not found"} if service is missing.
    """
    session = db_manager.get_session()
    try:
        appt = session.query(Appointment).filter_by(reservation_code=code).first()
        if not appt:
            return jsonify({"status": "not_found"}), 404

        service = session.query(Service).filter_by(id=appt.service_id).first()
        if not service:
            return jsonify({"status": "error", "message": "Service not found"}), 500

        authorized = has_valid_bot_token() or is_admin_cookie_valid()

        if not authorized:
            phone = request.args.get("phone")
            if not phone or appt.phone != phone:
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
    finally:
        db_manager.close()
