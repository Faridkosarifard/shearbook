from flask import Blueprint, jsonify, request

from entity import Setting
from utils.db import SessionLocal

settings_api = Blueprint("settings_api", __name__)


@settings_api.route("/settings", methods=["GET"])
def get_settings():
    session = SessionLocal()
    try:
        settings = session.query(Setting).all()
        return jsonify({s.key: s.value for s in settings})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})
    finally:
        session.close()


@settings_api.route("/settings", methods=["PUT"])
def update_settings():
    data = request.json
    session = SessionLocal()
    for key, value in data.items():
        setting = session.query(Setting).filter_by(key=key).first()
        if setting:
            setting.value = value
        else:
            setting = Setting(key=key, value=value)
            session.add(setting)
    session.commit()
    session.close()
    return jsonify({"status": "ok"})


@settings_api.route("/settings/<key>", methods=["GET"])
def get_setting(key):
    session = SessionLocal()
    setting = session.query(Setting).filter_by(key=key).first()
    session.close()
    if setting:
        return jsonify({"key": key, "value": setting.value})
    return jsonify({"error": "not found"}), 404


@settings_api.route("/settings/<key>", methods=["POST"])
def set_setting(key):
    value = request.json.get("value")
    if value is None:
        return jsonify({"error": "value required"}), 400
    session = SessionLocal()
    setting = session.query(Setting).filter_by(key=key).first()
    if setting:
        setting.value = value
    else:
        setting = Setting(key=key, value=value)
        session.add(setting)
    session.commit()
    session.close()
    return jsonify({"status": "ok"})


@settings_api.route("/settings/<key>", methods=["DELETE"])
def delete_setting(key):
    session = SessionLocal()
    setting = session.query(Setting).filter_by(key=key).first()
    if setting:
        session.delete(setting)
        session.commit()
        session.close()
        return jsonify({"status": "deleted"})
    session.close()
    return jsonify({"error": "not found"}), 404
