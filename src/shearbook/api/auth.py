from flask import Blueprint, jsonify, make_response, request

from shearbook.db.session import get_session
from shearbook.models import User
from shearbook.security import (
    admin_username,
    clear_admin_cookie,
    is_admin_cookie_valid,
    issue_csrf,
    require_admin,
    set_admin_cookie,
)

auth_api = Blueprint("auth", __name__)


@auth_api.post("/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return jsonify({"status": "error", "message": "bad_request"}), 400

    import bcrypt

    session = get_session()
    user = session.query(User).filter_by(username=username).first()
    if not user or not bcrypt.checkpw(password.encode(), user.password_hash.encode()):
        return jsonify({"status": "error", "message": "invalid_credentials"}), 401
    resp = make_response(jsonify({"status": "ok", "username": user.username}))
    resp = set_admin_cookie(resp, user.username)
    resp, _ = issue_csrf(resp)
    return resp


@auth_api.post("/auth/logout")
def logout():
    resp = make_response(jsonify({"status": "ok"}))
    return clear_admin_cookie(resp)


@auth_api.get("/auth/session")
def session_status():
    """Return the current admin session without a 401 when signed out.

    The admin UI uses this on first load so a signed-out visit does not
    appear as a failed request in the browser console.
    """
    if not is_admin_cookie_valid():
        return jsonify({"status": "ok", "authenticated": False})
    username = admin_username()
    if not username:
        return jsonify({"status": "ok", "authenticated": False})
    resp = make_response(jsonify({"status": "ok", "authenticated": True, "username": username}))
    resp, _ = issue_csrf(resp)
    return resp


@auth_api.get("/auth/csrf")
@require_admin
def csrf():
    resp = make_response(jsonify({"status": "ok"}))
    resp, _ = issue_csrf(resp)
    return resp
