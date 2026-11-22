from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from shearbook.db.session import get_session
from shearbook.models import Blacklist
from shearbook.phones import normalize_phone
from shearbook.security import require_admin, require_bot_or_admin, require_csrf

blacklist_api = Blueprint("blacklist", __name__)


@blacklist_api.get("/blacklist/<phone>")
@require_bot_or_admin
def is_blacklisted(phone: str):
    session = get_session()
    entry = session.query(Blacklist).filter_by(phone=normalize_phone(phone)).first()
    return jsonify({"blacklisted": bool(entry)})


@blacklist_api.get("/blacklist")
@require_admin
def list_blacklist():
    session = get_session()
    items = session.query(Blacklist).order_by(Blacklist.id).all()
    return jsonify([{"id": b.id, "phone": b.phone} for b in items])


@blacklist_api.post("/blacklist")
@require_admin
@require_csrf
def add_blacklist():
    data = request.get_json(silent=True) or {}
    phone = normalize_phone(data.get("phone"))
    if not phone:
        return jsonify({"status": "error", "message": "phone_required"}), 400
    session = get_session()
    session.add(Blacklist(phone=phone))
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        return jsonify({"status": "error", "message": "already_exists"}), 400
    return jsonify({"status": "ok", "phone": phone}), 201


@blacklist_api.delete("/blacklist/<phone>")
@require_admin
@require_csrf
def delete_blacklist(phone: str):
    session = get_session()
    entry = session.query(Blacklist).filter_by(phone=normalize_phone(phone)).first()
    if not entry:
        return jsonify({"status": "error", "message": "not_found"}), 404
    session.delete(entry)
    session.commit()
    return jsonify({"status": "ok"})
