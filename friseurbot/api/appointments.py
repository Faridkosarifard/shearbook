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


@appointments_api.route("/create-event", methods=["POST"])
@require_bot_or_admin
@require_csrf
def create_event():
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

        # اعتبارسنجی زمان ISO
        try:
            start = datetime.datetime.fromisoformat(start_str)
        except Exception:
            return (
                jsonify({"status": "error", "message": "invalid start datetime"}),
                400,
            )

        duration = service.duration_min
        end = start + datetime.timedelta(minutes=duration)

        # ایجاد رویداد گوگل
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

        reservation_code = generate_unique_reservation_code(
            prefix="KR", session=session
        )

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
        db_manager.close()


@appointments_api.route("/save-customer", methods=["POST"])
@require_bot_or_admin
@require_csrf
def save_customer_api():
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
@require_admin  # لیست کامل رزروها: فقط پنل ادمین
def get_appointments():
    session = db_manager.get_session()
    try:
        appointments = (
            session.query(Appointment).options(joinedload(Appointment.service)).all()
        )
        return jsonify(
            [
                {
                    "name": a.name,
                    "phone": a.phone,
                    "service": a.service.name if a.service else None,
                    "duration": a.service.duration_min if a.service else None,
                    "date": a.date.isoformat(),
                    "time": a.time.strftime("%H:%M"),
                    "reservation_code": a.reservation_code,
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
@require_bot_or_admin
@require_csrf
def update_reservation(code):
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
    """
    رفتار امنیتی:
      - اگر درخواست از سمت Bot یا Admin باشد (هدر/کوکی معتبر)، اطلاعات کامل را برمی‌گردانیم.
      - اگر هیچ‌کدام نبود (کلاینت عمومی)، باید phone در query بیاید و با رکورد هم‌خوان باشد؛
        در غیر این صورت 403 می‌دهیم. (این اجازه می‌دهد فردی که کُد و شماره را دارد، جزئیاتش را ببیند.)
    """
    session = db_manager.get_session()
    try:
        appt = session.query(Appointment).filter_by(reservation_code=code).first()
        if not appt:
            return jsonify({"status": "not_found"}), 404

        # Admin/Bot؟
        authorized = has_valid_bot_token() or is_admin_cookie_valid()

        # اگر عمومی است، phone باید معتبر باشد
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
def get_verification(code):  # نام قبلی get_veryfication → بهتر: get_verification
    """
    مشابه endpoint بالا:
      - اگر Admin/Bot است: اجازه.
      - اگر عمومی است: phone باید با رکورد بخواند، وگرنه 403.
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
