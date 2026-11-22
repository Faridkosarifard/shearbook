from datetime import date, datetime

from flask import Blueprint, current_app, jsonify, request
from sqlalchemy.orm import joinedload

from shearbook.booking import (
    BookingError,
    appointment_by_code,
    cancel_appointment,
    create_appointment,
    reschedule_appointment,
    serialize_appointment,
    update_appointment_time,
    upsert_customer,
)
from shearbook.db.session import get_session
from shearbook.models import Appointment
from shearbook.phones import phones_match
from shearbook.security import (
    has_valid_bot_token,
    is_admin_cookie_valid,
    require_admin,
    require_bot_or_admin,
    require_csrf,
)

appointments_api = Blueprint("appointments", __name__)


def _err(exc: BookingError):
    return jsonify({"status": "error", "message": exc.message}), exc.status


@appointments_api.post("/appointments")
@require_bot_or_admin
@require_csrf
def create():
    data = request.get_json(silent=True) or {}
    start_str = data.get("start")
    if not start_str:
        return jsonify({"status": "error", "message": "missing data"}), 400
    try:
        start = datetime.fromisoformat(start_str)
    except ValueError:
        return jsonify({"status": "error", "message": "invalid start datetime"}), 400
    name = data.get("name")
    phone = data.get("phone")
    service_id = data.get("service_id")
    stylist_raw = data.get("stylist_id") or data.get("friseur_id")
    if (
        not isinstance(name, str)
        or not isinstance(phone, str)
        or service_id is None
        or stylist_raw is None
    ):
        return jsonify({"status": "error", "message": "missing data"}), 400
    session = get_session()
    try:
        appt = create_appointment(
            session,
            current_app.config,
            name=name,
            phone=phone,
            service_id=int(service_id),
            start=start,
            stylist_id=int(stylist_raw),
        )
        session.commit()
        return jsonify(
            {
                "status": "ok",
                "reservation_code": appt.reservation_code,
                "appointment": serialize_appointment(appt),
            }
        )
    except BookingError as exc:
        session.rollback()
        return _err(exc)


@appointments_api.post("/customers")
@require_bot_or_admin
@require_csrf
def save_customer():
    data = request.get_json(silent=True) or {}
    if not data.get("name") or not data.get("phone"):
        return jsonify({"status": "error", "message": "name and phone required"}), 400
    session = get_session()
    try:
        upsert_customer(session, data["name"], data["phone"])
        session.commit()
    except BookingError as exc:
        session.rollback()
        return _err(exc)
    return jsonify({"status": "ok"})


@appointments_api.get("/appointments")
@require_admin
def list_appointments():
    session = get_session()
    query = session.query(Appointment).options(
        joinedload(Appointment.service), joinedload(Appointment.stylist)
    )
    start = request.args.get("from")
    end = request.args.get("to")
    stylist_id = request.args.get("stylist_id", type=int)
    if start:
        query = query.filter(Appointment.date >= date.fromisoformat(start))
    if end:
        query = query.filter(Appointment.date <= date.fromisoformat(end))
    if stylist_id:
        query = query.filter(Appointment.stylist_id == stylist_id)
    rows = query.order_by(Appointment.date, Appointment.time).all()
    return jsonify([serialize_appointment(a) for a in rows])


@appointments_api.get("/appointments/<code>")
def get_one(code: str):
    session = get_session()
    appt = appointment_by_code(session, code)
    if not appt:
        return jsonify({"status": "not_found"}), 404
    privileged = has_valid_bot_token() or is_admin_cookie_valid()
    phone = request.args.get("phone")
    if not privileged:
        if not phone or not phones_match(appt.phone, phone):
            return jsonify({"status": "error", "message": "forbidden"}), 403
    return jsonify(serialize_appointment(appt))


@appointments_api.put("/appointments/<code>")
@require_bot_or_admin
@require_csrf
def update_one(code: str):
    data = request.get_json(silent=True) or {}
    if not data.get("new_date") or not data.get("new_time"):
        return jsonify({"status": "error", "message": "missing date or time"}), 400
    session = get_session()
    try:
        appt = update_appointment_time(
            session, current_app.config, code, data["new_date"], data["new_time"]
        )
        session.commit()
        return jsonify({"status": "ok", "appointment": serialize_appointment(appt)})
    except BookingError as exc:
        session.rollback()
        return _err(exc)


@appointments_api.delete("/appointments/<code>")
@require_bot_or_admin
@require_csrf
def cancel(code: str):
    session = get_session()
    if cancel_appointment(session, current_app.config, code):
        session.commit()
        return jsonify({"status": "ok"})
    return jsonify({"status": "not_found"}), 404


@appointments_api.post("/appointments/<int:appointment_id>/reschedule")
@require_admin
@require_csrf
def reschedule(appointment_id: int):
    data = request.get_json(silent=True) or {}
    if not data.get("new_date") or not data.get("new_time"):
        return jsonify({"status": "error", "message": "missing date or time"}), 400
    session = get_session()
    try:
        appt = reschedule_appointment(
            session,
            current_app.config,
            appointment_id,
            new_date=data["new_date"],
            new_time=data["new_time"],
            new_stylist_id=data.get("stylist_id") or data.get("new_stylist_id"),
        )
        session.commit()
        return jsonify({"status": "ok", "appointment": serialize_appointment(appt)})
    except BookingError as exc:
        session.rollback()
        return _err(exc)
