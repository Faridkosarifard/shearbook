from flask import Blueprint, jsonify, request
from sqlalchemy.exc import SQLAlchemyError

from friseurbot.entity import Friseur
from friseurbot.security import require_admin  # only Admin UI can write
from friseurbot.security import require_bot_or_admin  # shared read for Bot & Admin UI
from friseurbot.security import (
    require_csrf,  # CSRF for UI write ops (Bot exempt inside decorator)
)
from friseurbot.utils.calendar_tools import create_calendar_for_friseur
from friseurbot.utils.db.manager import db_manager

friseur_api = Blueprint("friseur_api", __name__)


@friseur_api.route("/friseure", methods=["GET"])
@require_bot_or_admin
def get_friseure():
    """
    Return the list of hairdressers (Friseur) for both Bot and Admin UI.
    Access:
        - Bot: allowed (read-only)
        - Admin UI: allowed
        - Public: denied
    """
    session = db_manager.get_session()
    try:
        friseure = session.query(Friseur).order_by(Friseur.id).all()
        return jsonify(
            [
                {
                    "id": f.id,
                    "name": f.name,
                    "calendar_id": f.calendar_id,
                    "active": f.active,
                }
                for f in friseure
            ]
        )
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()


@friseur_api.route("/friseure", methods=["POST"])
@require_admin
@require_csrf
def add_friseur():
    """
    Create a new hairdresser and its dedicated Google Calendar.
    Body (JSON):
        {
          "name": "Alice",
          "active": true
        }
    Access:
        - Admin UI only (write)
    """
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    active = data.get("active", True)

    if not isinstance(name, str) or not name.strip():
        return jsonify({"status": "error", "message": "Invalid 'name'"}), 400
    if not isinstance(active, bool):
        return jsonify({"status": "error", "message": "Invalid 'active' (bool)"}), 400

    session = db_manager.get_session()
    try:
        # Create (or fetch) a calendar for this hairdresser
        calendar_id = create_calendar_for_friseur(name.strip())

        new_f = Friseur(
            name=name.strip(),
            active=active,
            calendar_id=calendar_id,
        )
        session.add(new_f)
        session.flush()  # ensure ID is assigned
        session.refresh(new_f)
        session.commit()

        return jsonify(
            {
                "status": "ok",
                "friseur": {
                    "id": new_f.id,
                    "name": new_f.name,
                    "active": new_f.active,
                    "calendar_id": new_f.calendar_id,
                },
            }
        )
    except SQLAlchemyError as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()


@friseur_api.route("/friseure/<int:friseur_id>", methods=["PUT"])
@require_admin
@require_csrf
def update_friseur(friseur_id: int):
    """
    Update hairdresser's basic attributes (name, active).
    Body (JSON):
        {
          "name": "New Name",
          "active": true
        }
    Access:
        - Admin UI only (write)
    """
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    active = data.get("active")

    if not isinstance(name, str) or not name.strip():
        return jsonify({"status": "error", "message": "Invalid 'name'"}), 400
    if not isinstance(active, bool):
        return jsonify({"status": "error", "message": "Invalid 'active' (bool)"}), 400

    session = db_manager.get_session()
    try:
        f = session.get(Friseur, friseur_id)
        if not f:
            return jsonify({"status": "error", "message": "Not found"}), 404

        f.name = name.strip()
        f.active = active
        session.commit()
        return jsonify(
            {
                "status": "ok",
                "friseur": {
                    "id": f.id,
                    "name": f.name,
                    "active": f.active,
                    "calendar_id": f.calendar_id,
                },
            }
        )
    except SQLAlchemyError as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()


@friseur_api.route("/friseure/<int:friseur_id>", methods=["DELETE"])
@require_admin
@require_csrf
def delete_friseur(friseur_id: int):
    """
    Delete a hairdresser by ID.
    Access:
        - Admin UI only (write)
    """
    session = db_manager.get_session()
    try:
        f = session.get(Friseur, friseur_id)
        if not f:
            return jsonify({"status": "error", "message": "Not found"}), 404

        session.delete(f)
        session.commit()
        return jsonify({"status": "ok"})
    except SQLAlchemyError as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()


@friseur_api.route("/friseure/<int:friseur_id>", methods=["GET"])
@require_bot_or_admin
def get_calendar_id(friseur_id: int):
    """
    Return the calendar_id for a specific hairdresser.
    Access:
        - Bot: allowed (read-only)
        - Admin UI: allowed
        - Public: denied
    """
    session = db_manager.get_session()
    try:
        f = session.query(Friseur).filter_by(id=friseur_id).first()
        if not f:
            return jsonify({"status": "error", "message": "Not found"}), 404
        return jsonify({"calendar_id": f.calendar_id})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()
