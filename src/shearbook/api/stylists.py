from datetime import date

from flask import Blueprint, current_app, jsonify, request
from sqlalchemy import select

from shearbook.booking import BookingError, reschedule_appointment, serialize_appointment
from shearbook.calendar.factory import get_calendar
from shearbook.db.session import get_session
from shearbook.models import Appointment, Stylist
from shearbook.security import require_admin, require_bot_or_admin, require_csrf

stylists_api = Blueprint("stylists", __name__)


def _json(stylist: Stylist) -> dict:
    return {
        "id": stylist.id,
        "name": stylist.name,
        "active": stylist.active,
        "calendar_id": stylist.calendar_id,
    }


@stylists_api.get("/stylists")
@require_bot_or_admin
def list_stylists():
    session = get_session()
    query = select(Stylist).order_by(Stylist.name)
    active = request.args.get("active")
    if active is not None:
        flag = active.lower() in {"1", "true", "yes"}
        query = query.where(Stylist.active == flag)
    rows = session.scalars(query).all()
    return jsonify([_json(s) for s in rows])


@stylists_api.get("/stylists/<int:stylist_id>")
@require_bot_or_admin
def get_one(stylist_id: int):
    session = get_session()
    stylist = session.get(Stylist, stylist_id)
    if not stylist:
        return jsonify({"status": "error", "message": "not_found"}), 404
    return jsonify(_json(stylist))


@stylists_api.post("/stylists")
@require_admin
@require_csrf
def add_stylist():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"status": "error", "message": "invalid_name"}), 400
    session = get_session()
    calendar = get_calendar(session)
    stylist = Stylist(name=name, active=bool(data.get("active", True)))
    session.add(stylist)
    session.flush()
    tz = current_app.config["TIMEZONE"]
    stylist.calendar_id = calendar.create_calendar(f"ShearBook – {stylist.name}", tz)
    session.commit()
    return jsonify({"status": "ok", "stylist": _json(stylist)}), 201


@stylists_api.put("/stylists/<int:stylist_id>")
@require_admin
@require_csrf
def update_stylist(stylist_id: int):
    data = request.get_json(silent=True) or {}
    session = get_session()
    stylist = session.get(Stylist, stylist_id)
    if not stylist:
        return jsonify({"status": "error", "message": "not_found"}), 404
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"status": "error", "message": "invalid_name"}), 400
        stylist.name = name
    if "active" in data:
        stylist.active = bool(data["active"])
    session.commit()
    return jsonify({"status": "ok", "stylist": _json(stylist)})


@stylists_api.delete("/stylists/<int:stylist_id>")
@require_admin
@require_csrf
def delete_stylist(stylist_id: int):
    session = get_session()
    stylist = session.get(Stylist, stylist_id)
    if not stylist:
        return jsonify({"status": "error", "message": "not_found"}), 404
    remaining = session.query(Appointment).filter(Appointment.stylist_id == stylist_id).count()
    if remaining:
        return jsonify({"status": "error", "message": "has_appointments", "count": remaining}), 409
    calendar = get_calendar(session)
    if stylist.calendar_id:
        calendar.delete_calendar(stylist.calendar_id)
    session.delete(stylist)
    session.commit()
    return jsonify({"status": "ok"})


@stylists_api.post("/stylists/<int:stylist_id>/reassign")
@require_admin
@require_csrf
def reassign(stylist_id: int):
    data = request.get_json(silent=True) or {}
    target_id = data.get("new_stylist_id") or data.get("stylist_id")
    if not target_id:
        return jsonify({"status": "error", "message": "new_stylist_id required"}), 400
    session = get_session()
    source = session.get(Stylist, stylist_id)
    target = session.get(Stylist, int(target_id))
    if not source or not target:
        return jsonify({"status": "error", "message": "not_found"}), 404
    ids = data.get("appointment_ids")
    query = session.query(Appointment).filter(Appointment.stylist_id == stylist_id)
    if data.get("upcoming_only", True):
        query = query.filter(Appointment.date >= date.today())
    if ids:
        query = query.filter(Appointment.id.in_([int(i) for i in ids]))
    appointments = query.all()
    moved, failed = [], []
    for appt in appointments:
        try:
            updated = reschedule_appointment(
                session,
                current_app.config,
                appt.id,
                new_date=appt.date.isoformat(),
                new_time=appt.time.strftime("%H:%M"),
                new_stylist_id=target.id,
            )
            moved.append(serialize_appointment(updated))
        except BookingError as exc:
            failed.append({"appointment_id": appt.id, "reason": exc.message})
    session.commit()
    return jsonify({"status": "ok", "moved": moved, "failed": failed})
