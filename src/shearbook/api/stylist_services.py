from flask import Blueprint, jsonify, request
from sqlalchemy import delete, select

from shearbook.db.session import get_session
from shearbook.models import Service, Stylist, stylist_service
from shearbook.security import require_bot_or_admin, require_csrf

stylist_services_api = Blueprint("stylist_services", __name__)


def _service_json(s: Service) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "duration_min": s.duration_min,
        "duration": s.duration_min,
        "position": s.position,
    }


@stylist_services_api.get("/stylists/<int:stylist_id>/services")
@require_bot_or_admin
def get_for_stylist(stylist_id: int):
    session = get_session()
    if not session.get(Stylist, stylist_id):
        return jsonify({"status": "not_found"}), 404
    rows = session.scalars(
        select(Service)
        .join(stylist_service, Service.id == stylist_service.c.service_id)
        .where(stylist_service.c.stylist_id == stylist_id)
        .order_by(Service.position, Service.id)
    ).all()
    return jsonify(
        {"status": "ok", "stylist_id": stylist_id, "services": [_service_json(s) for s in rows]}
    )


@stylist_services_api.put("/stylists/<int:stylist_id>/services")
@require_bot_or_admin
@require_csrf
def set_for_stylist(stylist_id: int):
    data = request.get_json(silent=True) or {}
    ids = data.get("service_ids") or data.get("services") or []
    try:
        ids = [int(i) for i in ids]
    except Exception:
        return jsonify({"status": "error", "message": "invalid_service_ids"}), 400
    session = get_session()
    stylist = session.get(Stylist, stylist_id)
    if not stylist:
        return jsonify({"status": "not_found"}), 404
    services = session.scalars(select(Service).where(Service.id.in_(ids))).all() if ids else []
    if len(services) != len(set(ids)):
        return jsonify({"status": "error", "message": "unknown_service"}), 400
    session.execute(delete(stylist_service).where(stylist_service.c.stylist_id == stylist_id))
    stylist.services = list(services)
    session.commit()
    return jsonify({"status": "ok", "services": [_service_json(s) for s in services]})


@stylist_services_api.post("/stylists/<int:stylist_id>/services")
@require_bot_or_admin
@require_csrf
def add_one(stylist_id: int):
    data = request.get_json(silent=True) or {}
    service_id = data.get("service_id")
    session = get_session()
    stylist = session.get(Stylist, stylist_id)
    service = session.get(Service, service_id) if service_id else None
    if not stylist or not service:
        return jsonify({"status": "not_found"}), 404
    if service not in stylist.services:
        stylist.services.append(service)
        session.commit()
    return jsonify({"status": "ok"})


@stylist_services_api.delete("/stylists/<int:stylist_id>/services/<int:service_id>")
@require_bot_or_admin
@require_csrf
def remove_one(stylist_id: int, service_id: int):
    session = get_session()
    stylist = session.get(Stylist, stylist_id)
    service = session.get(Service, service_id)
    if not stylist or not service:
        return jsonify({"status": "not_found"}), 404
    if service in stylist.services:
        stylist.services.remove(service)
        session.commit()
    return jsonify({"status": "ok"})


@stylist_services_api.get("/services/<int:service_id>/stylists")
@require_bot_or_admin
def stylists_for_service(service_id: int):
    session = get_session()
    if not session.get(Service, service_id):
        return jsonify({"status": "not_found"}), 404
    stmt = (
        select(Stylist)
        .join(stylist_service, Stylist.id == stylist_service.c.stylist_id)
        .where(stylist_service.c.service_id == service_id)
        .order_by(Stylist.name)
    )
    active = request.args.get("active")
    if active is not None:
        stmt = stmt.where(Stylist.active == (active.lower() in {"1", "true", "yes"}))
    rows = session.scalars(stmt).all()
    return jsonify(
        [
            {"id": s.id, "name": s.name, "active": s.active, "calendar_id": s.calendar_id}
            for s in rows
        ]
    )
