import traceback

from flask import Blueprint, jsonify, request

from utils.calendar_tools import get_free_slots

free_times_api = Blueprint("free_times", __name__)


@free_times_api.route("/free-times", methods=["POST"])
def free_times():
    data = request.json
    date = data.get("date")
    duration = data.get("duration")
    calendar_id = data.get("calendar_id")

    if not date or not duration:
        return (
            jsonify({"status": "error", "message": "date and duration required"}),
            400,
        )

    try:
        slots = get_free_slots(date, int(duration), calendar_id)
        return jsonify({"status": "ok", "slots": slots})
    except Exception as e:
        traceback.print_exc()
        print("❌ Fehler in /free-times:", str(e))
        return jsonify({"status": "error", "message": str(e)}), 500
