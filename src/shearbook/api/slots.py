from flask import Blueprint, current_app, jsonify, request

from shearbook.availability import get_free_slots
from shearbook.calendar.factory import get_calendar
from shearbook.db.session import get_session
from shearbook.security import require_bot_or_admin

slots_api = Blueprint("slots", __name__)


@slots_api.post("/slots")
@require_bot_or_admin
def free_slots():
    data = request.get_json(silent=True) or {}
    date = data.get("date")
    duration = data.get("duration")
    if not isinstance(date, str) or not date.strip():
        return jsonify({"status": "error", "message": "invalid_date"}), 400
    try:
        if duration is None:
            raise ValueError
        duration = int(duration)
        if duration <= 0:
            raise ValueError
    except Exception:
        return jsonify({"status": "error", "message": "invalid_duration"}), 400

    session = get_session()
    calendar = get_calendar(session)
    slots, reason = get_free_slots(
        session,
        calendar,
        date.strip(),
        duration,
        stylist_id=data.get("stylist_id") or data.get("friseur_id"),
        calendar_id=data.get("calendar_id"),
        tz_name=current_app.config["TIMEZONE"],
        holiday_country=current_app.config["HOLIDAY_COUNTRY"],
        holiday_region=current_app.config["HOLIDAY_REGION"],
        slot_step_min=int(current_app.config["SLOT_STEP_MIN"]),
    )
    return jsonify({"status": "ok", "slots": slots, "reason": reason})
