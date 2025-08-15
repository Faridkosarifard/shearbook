from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from friseurbot.entity import Blacklist
from friseurbot.security import (
    require_admin,  # Only Admin UI can read full list or modify
)
from friseurbot.security import (
    require_bot_or_admin,  # Bot or Admin can read single-phone status
)
from friseurbot.security import (
    require_csrf,  # CSRF protection for UI write ops (Bot exempt inside decorator)
)
from friseurbot.utils.db.manager import db_manager

blacklist_api = Blueprint("blacklist_api", __name__)


@blacklist_api.route("/blacklist/<phone>", methods=["GET"])
@require_bot_or_admin
def is_blacklisted(phone: str):
    """
    Check if a phone number is blacklisted.

    Access:
        - Bot: allowed (read-only)
        - Admin UI: allowed
        - Public: denied
    """
    session = db_manager.get_session()
    try:
        entry = session.query(Blacklist).filter(Blacklist.phone == phone).first()
        return jsonify({"blacklisted": bool(entry)})
    except Exception as e:
        return (
            jsonify({"status": "error", "message": str(e), "blacklisted": False}),
            500,
        )
    finally:
        db_manager.close()


@blacklist_api.route("/blacklist", methods=["GET"])
@require_admin
def get_blacklist():
    """
    Return the full blacklist.

    Access:
        - Admin UI only (read)
    """
    session = db_manager.get_session()
    try:
        items = session.query(Blacklist).all()
        return jsonify([{"id": b.id, "phone": b.phone} for b in items])
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()


@blacklist_api.route("/blacklist", methods=["POST"])
@require_admin
@require_csrf
def add_blacklist():
    """
    Add a phone number to the blacklist.

    Body (JSON):
        { "phone": "<string>" }

    Access:
        - Admin UI only (write)
    """
    data = request.get_json(silent=True) or {}
    phone = data.get("phone")

    if not isinstance(phone, str) or not phone.strip():
        return jsonify({"status": "error", "message": "Phone number is required"}), 400

    phone = phone.strip()

    session = db_manager.get_session()
    try:
        entry = Blacklist(phone=phone)
        session.add(entry)
        session.commit()
        return (
            jsonify({"status": "ok", "message": "Phone number added", "phone": phone}),
            201,
        )
    except IntegrityError:
        session.rollback()
        return jsonify({"status": "error", "message": "Number already exists"}), 400
    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()


@blacklist_api.route("/blacklist/<phone>", methods=["DELETE"])
@require_admin
@require_csrf
def delete_blacklist(phone: str):
    """
    Remove a phone number from the blacklist.

    Access:
        - Admin UI only (write)
    """
    session = db_manager.get_session()
    try:
        entry = session.query(Blacklist).filter_by(phone=phone).first()
        if not entry:
            return (
                jsonify({"status": "error", "message": "Phone number not found"}),
                404,
            )

        session.delete(entry)
        session.commit()
        return jsonify({"status": "ok", "message": f"Number {phone} deleted"})
    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()
