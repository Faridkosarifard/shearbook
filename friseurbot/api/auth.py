# friseurbot/api/auth.py
# Third-party (others)
import bcrypt
from flask import Blueprint
from flask import jsonify
from flask import make_response
from flask import request

# Friseurbot
from friseurbot.entity import User
from friseurbot.security import clear_admin_cookie
from friseurbot.security import issue_csrf
from friseurbot.security import (
    require_admin,  # ensure /csrf is only reachable after login
)
from friseurbot.security import set_admin_cookie
from friseurbot.utils.db.manager import db_manager

auth_api = Blueprint("auth_api", __name__, url_prefix="/auth")


@auth_api.route("/login", methods=["POST"])
def login():
    """
    Admin login endpoint.
    - Verifies username/password using bcrypt.
    - Sets an HttpOnly cookie with an admin JWT.
    - Issues a CSRF token cookie for subsequent write operations from the UI.

    Body (JSON):
        {
          "username": "admin",
          "password": "****"
        }

    Returns:
        200 OK with {"status":"ok","username": "..."} and sets cookies.
        400/401 on error.
    """
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify({"status": "error", "message": "Bad request"}), 400

    session = db_manager.get_session()
    try:
        user = session.query(User).filter_by(username=username).first()
    finally:
        # close the DB session regardless of outcome
        db_manager.close()

    if not user or not bcrypt.checkpw(password.encode(), user.password.encode()):
        return jsonify({"status": "error", "message": "Invalid credentials"}), 401

    # Build response and set cookies (admin_token + csrf_token)
    resp = make_response(jsonify({"status": "ok", "username": user.username}))
    resp = set_admin_cookie(resp, user.username)
    resp, _csrf = issue_csrf(resp)
    return resp


@auth_api.route("/logout", methods=["POST"])
def logout():
    """
    Admin logout endpoint.
    - Clears the admin auth cookie. Idempotent and safe to call even if not logged in.
    """
    resp = make_response(jsonify({"status": "ok"}))
    return clear_admin_cookie(resp)


@auth_api.route("/csrf", methods=["GET"])
@require_admin
def csrf():
    """
    Refresh CSRF token after a valid admin session is present.
    Returns a fresh CSRF cookie and {"status":"ok"}.
    """
    resp = make_response(jsonify({"status": "ok"}))
    resp, _token = issue_csrf(resp)
    return resp
