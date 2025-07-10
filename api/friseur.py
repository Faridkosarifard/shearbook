from flask import Blueprint, jsonify, request

from entity import Friseur
from utils.calendar_tools import create_calendar_for_friseur
from utils.db import SessionLocal

friseur_api = Blueprint("friseur_api", __name__)


@friseur_api.route("/friseure", methods=["GET"])
def get_friseure():
    session = SessionLocal()
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
    finally:
        session.close()


@friseur_api.route("/friseure", methods=["POST"])
def add_friseur():
    data = request.json
    session = SessionLocal()
    try:
        calendar_id = create_calendar_for_friseur(data["name"])
        new_f = Friseur(
            name=data["name"], active=data.get("active", True), calendar_id=calendar_id
        )
        session.add(new_f)
        session.commit()
        return jsonify({"status": "ok"})
    finally:
        session.close()


@friseur_api.route("/friseure/<int:friseur_id>", methods=["PUT"])
def update_friseur(friseur_id):
    data = request.json
    session = SessionLocal()
    try:
        f = session.query(Friseur).get(friseur_id)
        if not f:
            return jsonify({"status": "error", "message": "Not found"}), 404
        f.name = data["name"]
        f.active = data["active"]
        session.commit()
        return jsonify({"status": "ok"})
    finally:
        session.close()


@friseur_api.route("/friseure/<int:friseur_id>", methods=["DELETE"])
def delete_friseur(friseur_id):
    session = SessionLocal()
    try:
        f = session.query(Friseur).get(friseur_id)
        if not f:
            return jsonify({"status": "error", "message": "Not found"}), 404
        session.delete(f)
        session.commit()
        return jsonify({"status": "ok"})
    finally:
        session.close()


@friseur_api.route("/friseure/<int:friseur_id>", methods=["GET"])
def get_calendar_id(friseur_id):
    session = SessionLocal()
    try:
        f = session.query(Friseur).filter_by(id=friseur_id).first()
        if not f:
            return jsonify({"status": "error", "message": "Not found"}), 404
        return jsonify({"calnedar_id": f.calendar_id})
    finally:
        session.close()
