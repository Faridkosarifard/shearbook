import traceback

from flask import Blueprint, jsonify, request

from friseurbot.security import require_bot_or_admin  # Bot or Admin can call this
from friseurbot.utils.calendar_tools import get_free_slots

free_times_api = Blueprint("free_times", __name__)


@free_times_api.route("/free-times", methods=["POST"])
@require_bot_or_admin
def free_times():
    """
    Return available time slots for a given date/duration (optionally per calendar).

    Body (JSON):
        {
          "date": "YYYY-MM-DD",           # required
          "duration": 30,                 # required (minutes, int > 0)
          "calendar_id": "..."            # optional; if omitted, implementation may return merged slots or use defaults
        }

    Notes:
        - Shared endpoint used by both Bot and Admin UI.
        - Read-only operation; CSRF is not enforced here.
    """
    data = request.get_json(silent=True) or {}
    date = data.get("date")
    duration = data.get("duration")
    calendar_id = data.get("calendar_id")

    # Basic validation
    if not isinstance(date, str) or not date.strip():
        return jsonify({"status": "error", "message": "Invalid 'date'"}), 400

    try:
        duration = int(duration)
        if duration <= 0:
            raise ValueError
    except Exception:
        return (
            jsonify(
                {
                    "status": "error",
                    "message": "Invalid 'duration' (positive int required)",
                }
            ),
            400,
        )

    try:
        slots = get_free_slots(date.strip(), duration, calendar_id)
        return jsonify({"status": "ok", "slots": slots})
    except Exception as e:
        # Keep traceback in logs for debugging; return clean error to client
        traceback.print_exc()
        print("❌ Error in /free-times:", str(e))
        return jsonify({"status": "error", "message": str(e)}), 500
