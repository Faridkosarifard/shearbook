# Third-party (others)
from flask import Blueprint
from flask import jsonify
from flask import request

# Friseurbot
from friseurbot.entity import Setting
from friseurbot.security import require_admin  # Only Admin can write
from friseurbot.security import require_bot_or_admin  # Bot or Admin can read settings
from friseurbot.security import (
    require_csrf,  # CSRF required for UI write operations (Bot is exempt in decorator)
)
from friseurbot.utils.db.manager import db_manager

settings_api = Blueprint("settings_api", __name__)


@settings_api.route("/settings", methods=["GET"])
@require_bot_or_admin
def get_settings():
    """
    Return all settings as a key-value dict.

    Access:
        - Bot: allowed (read-only)
        - Admin UI: allowed
    """
    session = db_manager.get_session()
    try:
        settings = session.query(Setting).all()
        return jsonify({s.key: s.value for s in settings})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()


@settings_api.route("/settings", methods=["PUT"])
@require_admin
@require_csrf
def update_settings():
    """
    Upsert multiple settings in a single request.
    Body must be a JSON object of {key: value, ...}.

    Access:
        - Admin UI only (write)
    """
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not data:
        return jsonify({"status": "error", "message": "JSON object body required"}), 400

    session = db_manager.get_session()
    try:
        for key, value in data.items():
            if not isinstance(key, str) or key.strip() == "":
                return jsonify({"status": "error", "message": "invalid key"}), 400

            setting = session.query(Setting).filter_by(key=key).first()
            if setting:
                setting.value = value
            else:
                session.add(Setting(key=key, value=value))

        session.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()


@settings_api.route("/settings/<key>", methods=["GET"])
@require_bot_or_admin
def get_setting(key: str):
    """
    Return a single setting by key.

    Access:
        - Bot: allowed (read-only)
        - Admin UI: allowed
    """
    session = db_manager.get_session()
    try:
        setting = session.query(Setting).filter_by(key=key).first()
        if setting:
            return jsonify({"key": key, "value": setting.value})
        return jsonify({"status": "not_found"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()


@settings_api.route("/settings/<key>", methods=["POST"])
@require_admin
@require_csrf
def set_setting(key: str):
    """
    Create or update a single setting.

    Body:
        { "value": "<any serializable>" }

    Access:
        - Admin UI only (write)
    """
    body = request.get_json(silent=True) or {}
    if "value" not in body:
        return jsonify({"status": "error", "message": "value required"}), 400

    value = body.get("value")

    session = db_manager.get_session()
    try:
        setting = session.query(Setting).filter_by(key=key).first()
        if setting:
            setting.value = value
        else:
            session.add(Setting(key=key, value=value))

        session.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()


@settings_api.route("/settings/<key>", methods=["DELETE"])
@require_admin
@require_csrf
def delete_setting(key: str):
    """
    Delete a single setting by key.

    Access:
        - Admin UI only (write)
    """
    session = db_manager.get_session()
    try:
        setting = session.query(Setting).filter_by(key=key).first()
        if not setting:
            return jsonify({"status": "not_found"}), 404

        session.delete(setting)
        session.commit()
        return jsonify({"status": "deleted"})
    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()
