from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request

from entity import Session
from utils.db import SessionLocal

sessions_api = Blueprint("sessions_api", __name__)

TTL_MINUTES = 60


@sessions_api.route("/session/<chat_id>", methods=["GET"])
def get_session(chat_id):
    db = SessionLocal()
    session = db.query(Session).filter_by(chat_id=chat_id).first()

    if session:
        if session.expires_at and session.expires_at < datetime.now():
            db.delete(session)
            db.commit()
            return jsonify({})
        return jsonify(
            {
                "chat_id": session.chat_id,
                "step": session.step,
                "code": session.code,
                "data": session.data,
                "updated_at": session.updated_at.isoformat(),
            }
        )

    return jsonify({})


@sessions_api.route("/session/<chat_id>", methods=["POST"])
def set_session(chat_id):
    db = SessionLocal()
    payload = request.get_json()
    session = db.query(Session).filter_by(chat_id=chat_id).first()

    if not session:
        session = Session(chat_id=chat_id)
        db.add(session)

    session.step = payload.get("step")
    session.code = payload.get("code")
    session.data = payload.get("data", {})
    session.updated_at = datetime.now()
    session.expires_at = datetime.now() + timedelta(minutes=TTL_MINUTES)

    db.commit()
    return jsonify({"status": "ok"})


@sessions_api.route("/session/<chat_id>", methods=["DELETE"])
def delete_session(chat_id):
    db = SessionLocal()
    session = db.query(Session).filter_by(chat_id=chat_id).first()
    if session:
        db.delete(session)
        db.commit()
    return jsonify({"status": "deleted"})
