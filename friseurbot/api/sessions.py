# friseurbot/api/sessions.py
# Standard library
from datetime import datetime
from datetime import timedelta

# Third-party (others)
from flask import Blueprint
from flask import jsonify
from flask import request

# Friseurbot
from friseurbot.entity import Session
from friseurbot.security import require_bot_token
from friseurbot.utils.db.manager import db_manager

sessions_api = Blueprint("sessions_api", __name__)

TTL_MINUTES = 60


@sessions_api.route("/session/<chat_id>", methods=["GET"])
@require_bot_token
def get_session(chat_id):
    db = db_manager.get_session()
    try:
        s = db.query(Session).filter_by(chat_id=chat_id).first()
        if not s:

            return jsonify({"step": None, "code": None, "data": {}})

        s.expires_at = datetime.now() + timedelta(minutes=TTL_MINUTES)
        db.commit()

        return jsonify(
            {
                "step": s.step,
                "code": s.code,
                "data": s.data or {},
            }
        )
    finally:
        db_manager.close()


@sessions_api.route("/session/<chat_id>", methods=["POST"])
@require_bot_token
def set_session(chat_id):
    payload = request.get_json(silent=True) or {}
    step = payload.get("step")
    code = payload.get("code")
    data = payload.get("data") or {}

    if not isinstance(data, dict):
        return jsonify({"status": "error", "message": "data must be an object"}), 400

    db = db_manager.get_session()
    try:
        s = db.query(Session).filter_by(chat_id=chat_id).first()
        if not s:
            s = Session(chat_id=chat_id)

        s.step = step
        s.code = code
        s.data = data
        s.updated_at = datetime.now()
        s.expires_at = datetime.now() + timedelta(minutes=TTL_MINUTES)

        db.add(s)
        db.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        db.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()


@sessions_api.route("/session/<chat_id>", methods=["DELETE"])
@require_bot_token
def delete_session(chat_id):
    db = db_manager.get_session()
    try:
        s = db.query(Session).filter_by(chat_id=chat_id).first()
        if s:
            db.delete(s)
            db.commit()
        return jsonify({"status": "deleted"})
    finally:
        db_manager.close()
