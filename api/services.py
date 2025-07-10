from flask import Blueprint, jsonify, request
from sqlalchemy.orm import Session

from entity import Service
from utils.db import SessionLocal, get_all_services

services_api = Blueprint("services", __name__)


@services_api.route("/services", methods=["GET"])
def services():
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
        print("❌ Fehler beim Laden der Services:", e)
        return jsonify({"status": "error", "message": str(e)}), 500


@services_api.route("/services", methods=["POST"])
def add_service():
    data = request.json
    session = SessionLocal()
    try:
        count = session.query(Service).count()
        new_service = Service(
            name=data["name"], duration_min=data["duration"], position=count + 1
        )
        session.add(new_service)
        session.commit()
        return jsonify({"status": "ok"})
    finally:
        session.close()


# PUT update service
@services_api.route("/services/<int:service_id>", methods=["PUT"])
def update_service(service_id):
    data = request.json
    session = SessionLocal()
    try:
        service = session.query(Service).get(service_id)
        if not service:
            return jsonify({"status": "error", "message": "Service not found"}), 404
        service.name = data["name"]
        service.duration_min = data["duration"]
        session.commit()
        return jsonify({"status": "ok"})
    finally:
        session.close()


# DELETE service
@services_api.route("/services/<int:service_id>", methods=["DELETE"])
def delete_service(service_id):
    session = SessionLocal()
    try:
        service = session.query(Service).get(service_id)
        if not service:
            return jsonify({"status": "error", "message": "Service not found"}), 404
        session.delete(service)
        session.commit()
        return jsonify({"status": "ok"})
    finally:
        session.close()


# POST reorder service
@services_api.route("/services/<int:service_id>/reorder", methods=["POST"])
def reorder_service(service_id):
    data = request.json
    direction = data.get("duration_min")
    session = SessionLocal()
    try:
        service = session.query(Service).get(service_id)
        if not service:
            return jsonify({"status": "error", "message": "Service not found"}), 404

        if direction == "up":
            target = (
                session.query(Service)
                .filter(Service.position < service.position)
                .order_by(Service.position.desc())
                .first()
            )
        elif direction == "down":
            target = (
                session.query(Service)
                .filter(Service.position > service.position)
                .order_by(Service.position)
                .first()
            )
        else:
            return jsonify({"status": "error", "message": "Invalid direction"}), 400

        if target:
            service.position, target.position = target.position, service.position
            session.commit()

        return jsonify({"status": "ok"})
    finally:
        session.close()
