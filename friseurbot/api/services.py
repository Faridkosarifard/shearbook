from flask import Blueprint, jsonify, request

from friseurbot.entity import Service
from friseurbot.security import require_admin  # only Admin UI can write
from friseurbot.security import require_bot_or_admin  # allow Bot & Admin UI to read
from friseurbot.security import (
    require_csrf,  # CSRF required for UI write ops (Bot exempt inside decorator)
)
from friseurbot.utils.db.helper import get_all_services
from friseurbot.utils.db.manager import db_manager

services_api = Blueprint("services", __name__)


@services_api.route("/services", methods=["GET"])
@require_bot_or_admin
def services():
    """
    Return the list of services (shared for Bot and Admin UI).

    Access:
        - Bot: allowed (read-only)
        - Admin UI: allowed
        - Public: denied
    """
    try:
        services = get_all_services()
        return jsonify(
            [
                {
                    "id": s.id,
                    "name": s.name,
                    "duration": s.duration_min,
                    "position": s.position,
                }
                for s in services
            ]
        )
    except Exception as e:
        print("❌ Error loading services:", e)
        return jsonify({"status": "error", "message": str(e)}), 500


@services_api.route("/services", methods=["POST"])
@require_admin
@require_csrf
def add_service():
    """
    Create a new service.

    Body (JSON):
        {
          "name": "Haircut",
          "duration": 30
        }

    Access:
        - Admin UI only
    """
    data = request.get_json(silent=True) or {}

    name = data.get("name")
    duration = data.get("duration")

    # Basic validation
    if not isinstance(name, str) or not name.strip():
        return jsonify({"status": "error", "message": "Invalid 'name'"}), 400
    if not isinstance(duration, int) or duration <= 0:
        return jsonify({"status": "error", "message": "Invalid 'duration'"}), 400

    session = db_manager.get_session()
    try:
        count = session.query(Service).count()
        new_service = Service(
            name=name.strip(), duration_min=duration, position=count + 1
        )
        session.add(new_service)
        session.commit()
        return jsonify(
            {
                "status": "ok",
                "service": {
                    "id": new_service.id,
                    "name": new_service.name,
                    "duration": new_service.duration_min,
                    "position": new_service.position,
                },
            }
        )
    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()


@services_api.route("/services/<int:service_id>", methods=["PUT"])
@require_admin
@require_csrf
def update_service(service_id: int):
    """
    Update a service's name and duration.

    Body (JSON):
        {
          "name": "New Name",
          "duration": 45
        }

    Access:
        - Admin UI only
    """
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    duration = data.get("duration")

    if not isinstance(name, str) or not name.strip():
        return jsonify({"status": "error", "message": "Invalid 'name'"}), 400
    if not isinstance(duration, int) or duration <= 0:
        return jsonify({"status": "error", "message": "Invalid 'duration'"}), 400

    session = db_manager.get_session()
    try:
        service = session.get(Service, service_id)
        if not service:
            return jsonify({"status": "error", "message": "Service not found"}), 404

        service.name = name.strip()
        service.duration_min = duration
        session.commit()
        return jsonify(
            {
                "status": "ok",
                "service": {
                    "id": service.id,
                    "name": service.name,
                    "duration": service.duration_min,
                    "position": service.position,
                },
            }
        )
    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()


@services_api.route("/services/<int:service_id>", methods=["DELETE"])
@require_admin
@require_csrf
def delete_service(service_id: int):
    """
    Delete a service by ID.

    Access:
        - Admin UI only
    """
    session = db_manager.get_session()
    try:
        service = session.get(Service, service_id)
        if not service:
            return jsonify({"status": "error", "message": "Service not found"}), 404

        session.delete(service)
        session.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()


@services_api.route("/services/<int:service_id>/reorder", methods=["POST"])
@require_admin
@require_csrf
def reorder_service(service_id: int):
    """
    Reorder a service up/down by swapping positions with the nearest neighbor.

    Body (JSON):
        {
          "direction": "up" | "down"
        }

    Access:
        - Admin UI only
    """
    data = request.get_json(silent=True) or {}
    direction = data.get("direction")  # ✅ fixed (was duration_min by mistake)

    if direction not in ("up", "down"):
        return jsonify({"status": "error", "message": "Invalid direction"}), 400

    session = db_manager.get_session()
    try:
        service = session.get(Service, service_id)
        if not service:
            return jsonify({"status": "error", "message": "Service not found"}), 404

        if direction == "up":
            target = (
                session.query(Service)
                .filter(Service.position < service.position)
                .order_by(Service.position.desc())
                .first()
            )
        else:  # direction == "down"
            target = (
                session.query(Service)
                .filter(Service.position > service.position)
                .order_by(Service.position.asc())
                .first()
            )

        if not target:
            # Already at top/bottom; nothing to swap
            return jsonify({"status": "ok", "message": "No swap (edge position)"}), 200

        # Swap positions
        service.position, target.position = target.position, service.position
        session.commit()

        return jsonify(
            {
                "status": "ok",
                "moved": {
                    "id": service.id,
                    "new_position": service.position,
                },
                "swapped_with": {
                    "id": target.id,
                    "new_position": target.position,
                },
            }
        )
    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()
