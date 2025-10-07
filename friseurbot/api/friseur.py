# Standard library
from datetime import datetime
from datetime import timedelta
from logging import getLogger

# Third-party (others)
from flask import Blueprint
from flask import current_app
from flask import jsonify
from flask import request

# SQLAlchemy
from sqlalchemy import and_
from sqlalchemy import or_
from sqlalchemy import select
from sqlalchemy import update
from sqlalchemy.exc import SQLAlchemyError

# Friseurbot
from friseurbot.entity import Appointment
from friseurbot.entity import Friseur
from friseurbot.entity import Service
from friseurbot.security import require_admin
from friseurbot.security import require_bot_or_admin
from friseurbot.security import require_csrf
from friseurbot.utils.calendar_tools import BERLIN_TZ
from friseurbot.utils.calendar_tools import create_calendar_for_friseur
from friseurbot.utils.calendar_tools import move_or_insert_event_for_appointment
from friseurbot.utils.calendar_tools import suggest_free_slots_for_appointment
from friseurbot.utils.db.helper import get_upcoming_appointments
from friseurbot.utils.db.manager import db_manager

logger = getLogger(__name__)
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
        friseure = session.scalars(
            select(Friseur).where(Friseur.active == True).order_by(Friseur.name)
        ).all()
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

    session = db_manager.get_session()
    try:
        try:
            calendar_id = create_calendar_for_friseur(name)
        except Exception as e:
            logger.exception("Failed to create Google Calendar for '%s'", name)
            return jsonify({"status": "error", "message": f"calendar_error: {e}"}), 500

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
    Soft-Delete a hairdresser by ID.

    Access:
        - Admin UI only (write)
    """
    session = db_manager.get_session()
    try:
        f = session.get(Friseur, friseur_id)
        if not f:
            return jsonify({"status": "error", "message": "Not found"}), 404

        upcoming = get_upcoming_appointments(session, friseur_id)
        if upcoming:
            payload = [
                {
                    "appointment_id": ap.id,
                    "date": ap.date.isoformat(),
                    "time": ap.time.strftime("%H:%M"),
                    "customer_name": ap.name,
                    "phone": ap.phone,
                    "service_id": ap.service_id,
                    "service_name": getattr(ap.service, "name", None),
                }
                for ap in upcoming
            ]

            return (
                jsonify(
                    {
                        "status": "conflict",
                        "message": "Dieser Friseur hat noch zukünftige Termine. Bitte zuerst umbuchen.",
                        "upcoming_appointments": payload,
                    }
                ),
                409,
            )

        f.active = False
        session.commit()
        return jsonify({"status": "ok", "message": "Friseur deactivated"})
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


@friseur_api.route("/friseure/<int:friseur_id>/reassign", methods=["POST"])
@require_admin
@require_csrf
def reassign_future_appointments(friseur_id: int):
    """
    Reassign future appointments from `friseur_id` to `new_friseur_id`.
    Body:
      {
        "new_friseur_id": 12,
        "appointment_ids": [1,2,3]   # optional; if omitted, reassign all future appointments
      }
    Response:
      {
        "status": "ok",
        "reassigned": <int>,
        "moved":  [{ "appointment_id": 1, "action": "moved|ok|already_on_target_calendar", "event_id": "..." }],
        "failed": [{ "appointment_id": 3, "reason": "time_conflict|...", "suggested_slots": ["09:00","09:30"] }]
      }
    """
    session = db_manager.get_session()
    try:
        data = request.get_json(silent=True) or {}
        new_friseur_id = data.get("new_friseur_id")
        appointment_ids = data.get("appointment_ids")

        if not new_friseur_id:
            return (
                jsonify({"status": "error", "message": "new_friseur_id is required"}),
                400,
            )

        old_f = session.get(Friseur, friseur_id)
        new_f = session.get(Friseur, new_friseur_id)
        if not old_f:
            return jsonify({"status": "error", "message": "Old Friseur not found"}), 404
        if not new_f or new_f.active is False or not new_f.calendar_id:
            return (
                jsonify(
                    {
                        "status": "error",
                        "message": "New Friseur not found/inactive/no calendar",
                    }
                ),
                400,
            )

        # Collect future appointments: today (time >= now) and later dates.
        now = datetime.now(BERLIN_TZ)
        today, now_t = now.date(), now.time()

        ids = session.scalars(
            select(Appointment.id)
            .where(Appointment.friseur_id == friseur_id)
            .where(
                or_(
                    Appointment.date > today,
                    and_(Appointment.date == today, Appointment.time >= now_t),
                )
            )
        )
        upcoming_ids = set(ids)
        target_ids = (
            list(upcoming_ids & set(appointment_ids))
            if appointment_ids
            else list(upcoming_ids)
        )
        if not target_ids:
            return jsonify(
                {
                    "status": "ok",
                    "message": "No future appointments to reassign",
                    "reassigned": 0,
                    "moved": [],
                    "failed": [],
                }
            )

        moved, failed = [], []
        for appt_id in target_ids:
            ok, msg, event_id = move_or_insert_event_for_appointment(
                session, appt_id, int(new_friseur_id)
            )
            if ok:
                # Ensure ownership is updated (event is already moved/created by the helper).
                session.execute(
                    update(Appointment)
                    .where(Appointment.id == appt_id)
                    .values(friseur_id=int(new_friseur_id))
                )
                moved.append(
                    {"appointment_id": appt_id, "action": msg, "event_id": event_id}
                )
            else:
                # Provide same-day suggestions using your existing helper.
                suggest = suggest_free_slots_for_appointment(
                    session, appt_id, int(new_friseur_id)
                )
                failed.append(
                    {
                        "appointment_id": appt_id,
                        "reason": msg,
                        "suggested_slots": suggest,
                    }
                )

        session.commit()
        current_app.logger.debug(
            "REASSIGN result: moved=%d failed=%d", len(moved), len(failed)
        )
        return jsonify(
            {
                "status": "ok",
                "message": "Reassign attempted",
                "reassigned": len(moved),
                "moved": moved,
                "failed": failed,
            }
        )
    except SQLAlchemyError as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()
