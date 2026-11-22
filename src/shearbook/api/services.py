from flask import Blueprint, jsonify, request
from sqlalchemy import select

from shearbook.db.session import get_session
from shearbook.models import Service
from shearbook.security import require_admin, require_bot_or_admin, require_csrf

services_api = Blueprint("services", __name__)


def _json(service: Service) -> dict:
    return {
        "id": service.id,
        "name": service.name,
        "duration": service.duration_min,
        "position": service.position,
    }


@services_api.get("/services")
@require_bot_or_admin
def list_services():
    session = get_session()
    rows = session.scalars(select(Service).order_by(Service.position, Service.id)).all()
    return jsonify([_json(s) for s in rows])


@services_api.post("/services")
@require_admin
@require_csrf
def add_service():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    duration = data.get("duration")
    if not name:
        return jsonify({"status": "error", "message": "invalid_name"}), 400
    try:
        if duration is None:
            raise ValueError
        duration = int(duration)
        if duration <= 0:
            raise ValueError
    except Exception:
        return jsonify({"status": "error", "message": "invalid_duration"}), 400
    session = get_session()
    count = session.query(Service).count()
    service = Service(name=name, duration_min=duration, position=count + 1)
    session.add(service)
    session.commit()
    return jsonify({"status": "ok", "service": _json(service)}), 201


@services_api.put("/services/<int:service_id>")
@require_admin
@require_csrf
def update_service(service_id: int):
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    duration = data.get("duration")
    if not name:
        return jsonify({"status": "error", "message": "invalid_name"}), 400
    try:
        if duration is None:
            raise ValueError
        duration = int(duration)
        if duration <= 0:
            raise ValueError
    except Exception:
        return jsonify({"status": "error", "message": "invalid_duration"}), 400
    session = get_session()
    service = session.get(Service, service_id)
    if not service:
        return jsonify({"status": "error", "message": "not_found"}), 404
    service.name = name
    service.duration_min = duration
    session.commit()
    return jsonify({"status": "ok", "service": _json(service)})


@services_api.delete("/services/<int:service_id>")
@require_admin
@require_csrf
def delete_service(service_id: int):
    session = get_session()
    service = session.get(Service, service_id)
    if not service:
        return jsonify({"status": "error", "message": "not_found"}), 404
    session.delete(service)
    session.commit()
    return jsonify({"status": "ok"})


@services_api.post("/services/<int:service_id>/reorder")
@require_admin
@require_csrf
def reorder(service_id: int):
    direction = (request.get_json(silent=True) or {}).get("direction")
    if direction not in {"up", "down"}:
        return jsonify({"status": "error", "message": "invalid_direction"}), 400
    session = get_session()
    service = session.get(Service, service_id)
    if not service:
        return jsonify({"status": "error", "message": "not_found"}), 404
    if direction == "up":
        target = (
            session.query(Service)
            .filter(Service.position < service.position)
            .order_by(Service.position.desc())
            .first()
        )
    else:
        target = (
            session.query(Service)
            .filter(Service.position > service.position)
            .order_by(Service.position.asc())
            .first()
        )
    if not target:
        return jsonify({"status": "ok", "message": "no_swap"})
    service.position, target.position = target.position, service.position
    session.commit()
    return jsonify({"status": "ok", "service": _json(service)})
