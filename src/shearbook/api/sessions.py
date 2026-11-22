from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request

from shearbook.db.session import get_session
from shearbook.models import ChatSession
from shearbook.security import require_admin, require_bot_token

sessions_api = Blueprint("sessions", __name__)
TTL_MINUTES = 60


@sessions_api.get("/sessions")
@require_admin
def list_sessions():
    db = get_session()
    now = datetime.now()
    rows = db.query(ChatSession).order_by(ChatSession.updated_at.desc()).all()
    return jsonify(
        [
            {
                "id": row.chat_id,
                "phone": row.chat_id.split("@")[0] if row.chat_id else "",
                "step": row.step,
                "code": row.code,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
                "expires_at": row.expires_at.isoformat() if row.expires_at else None,
                "expired": bool(row.expires_at and row.expires_at < now),
            }
            for row in rows
        ]
    )


@sessions_api.get("/session/<chat_id>")
@require_bot_token
def get_chat_session(chat_id: str):
    db = get_session()
    row = db.get(ChatSession, chat_id)
    if not row or (row.expires_at and row.expires_at < datetime.now()):
        if row and row.expires_at and row.expires_at < datetime.now():
            db.delete(row)
            db.commit()
        return jsonify({"step": None, "code": None, "data": {}})
    row.expires_at = datetime.now() + timedelta(minutes=TTL_MINUTES)
    db.commit()
    return jsonify({"step": row.step, "code": row.code, "data": row.data or {}})


@sessions_api.post("/session/<chat_id>")
@require_bot_token
def set_chat_session(chat_id: str):
    payload = request.get_json(silent=True) or {}
    data = payload.get("data") or {}
    if not isinstance(data, dict):
        return jsonify({"status": "error", "message": "data must be an object"}), 400
    db = get_session()
    row = db.get(ChatSession, chat_id) or ChatSession(chat_id=chat_id)
    row.step = payload.get("step")
    row.code = payload.get("code")
    row.data = data
    row.updated_at = datetime.now()
    row.expires_at = datetime.now() + timedelta(minutes=TTL_MINUTES)
    db.add(row)
    db.commit()
    return jsonify({"status": "ok"})


@sessions_api.delete("/session/<chat_id>")
@require_bot_token
def delete_chat_session(chat_id: str):
    db = get_session()
    row = db.get(ChatSession, chat_id)
    if row:
        db.delete(row)
        db.commit()
    return jsonify({"status": "deleted"})
