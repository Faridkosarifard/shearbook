import bcrypt
from flask import Blueprint, jsonify, request
from sqlalchemy.orm import Session

from entity import User
from utils.db import SessionLocal

auth_api = Blueprint("auth_api", __name__)


@auth_api.route("/login", methods=["POST"])
def login():
    data = request.json
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return (
            jsonify(
                {
                    "status": "error",
                    "message": "Benutzername und Passwort sind erforderlich.",
                }
            ),
            400,
        )

    session: Session = SessionLocal()
    user = session.query(User).filter_by(username=username).first()
    session.close()

    if not user:
        return jsonify({"status": "error", "message": "Benutzer existiert nicht."}), 401

    if not bcrypt.checkpw(password.encode(), user.password.encode()):
        return jsonify({"status": "error", "message": "Falsches Passwort."}), 401

    return jsonify({"status": "ok", "username": user.username})
