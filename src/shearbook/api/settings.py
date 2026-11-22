from flask import Blueprint, jsonify, request

from shearbook.db.session import get_session
from shearbook.security import require_admin, require_bot_or_admin, require_csrf
from shearbook.settings_svc import delete_setting, get_setting, load_settings, upsert_settings

settings_api = Blueprint("settings", __name__)


@settings_api.get("/settings")
@require_bot_or_admin
def get_all():
    return jsonify(load_settings(get_session()))


@settings_api.put("/settings")
@require_admin
@require_csrf
def update_many():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not data:
        return jsonify({"status": "error", "message": "json_object_required"}), 400
    try:
        upsert_settings(
            get_session(), {str(k): "" if v is None else str(v) for k, v in data.items()}
        )
    except ValueError as exc:
        return jsonify({"status": "error", "message": str(exc)}), 400
    get_session().commit()
    return jsonify({"status": "ok"})


@settings_api.get("/settings/<key>")
@require_bot_or_admin
def get_one(key: str):
    value = get_setting(get_session(), key)
    if value is None:
        return jsonify({"status": "not_found"}), 404
    return jsonify({"key": key, "value": value})


@settings_api.post("/settings/<key>")
@require_admin
@require_csrf
def set_one(key: str):
    body = request.get_json(silent=True) or {}
    if "value" not in body:
        return jsonify({"status": "error", "message": "value_required"}), 400
    upsert_settings(get_session(), {key: "" if body["value"] is None else str(body["value"])})
    get_session().commit()
    return jsonify({"status": "ok"})


@settings_api.delete("/settings/<key>")
@require_admin
@require_csrf
def remove_one(key: str):
    if not delete_setting(get_session(), key):
        return jsonify({"status": "not_found"}), 404
    get_session().commit()
    return jsonify({"status": "deleted"})
