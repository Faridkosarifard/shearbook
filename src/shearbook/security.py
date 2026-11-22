"""Bot token, admin JWT cookie, and CSRF helpers."""

from __future__ import annotations

import datetime as dt
import secrets
from collections.abc import Callable
from functools import wraps
from typing import Any

import jwt
from flask import current_app, jsonify, request

BOT_HEADER = "X-Bot-Token"
ADMIN_COOKIE = "admin_token"
CSRF_COOKIE = "csrf_token"
CSRF_HEADER = "X-CSRF-Token"


def _cfg() -> dict[str, Any]:
    return current_app.config


def has_valid_bot_token() -> bool:
    expected = _cfg().get("BOT_TOKEN")
    if not expected:
        return False
    return request.headers.get(BOT_HEADER) == expected


def _issue_admin_jwt(username: str) -> str:
    hours = int(_cfg().get("JWT_EXP_HOURS", 8))
    now = dt.datetime.now(dt.UTC)
    payload = {
        "sub": username,
        "role": "admin",
        "iat": now,
        "exp": now + dt.timedelta(hours=hours),
    }
    token = jwt.encode(payload, _cfg()["JWT_SECRET"], algorithm="HS256")
    return token.decode("utf-8") if isinstance(token, bytes) else token


def _decode_admin_jwt(token: str) -> dict:
    leeway = int(_cfg().get("JWT_LEEWAY_SECONDS", 10))
    return jwt.decode(
        token,
        _cfg()["JWT_SECRET"],
        algorithms=["HS256"],
        leeway=dt.timedelta(seconds=leeway),
    )


def is_admin_cookie_valid() -> bool:
    token = request.cookies.get(ADMIN_COOKIE)
    if not token:
        return False
    try:
        claims = _decode_admin_jwt(token)
        return claims.get("role") == "admin"
    except Exception:
        return False


def admin_username() -> str | None:
    token = request.cookies.get(ADMIN_COOKIE)
    if not token:
        return None
    try:
        return str(_decode_admin_jwt(token).get("sub") or "") or None
    except Exception:
        return None


def _cookie_kwargs() -> dict:
    hours = int(_cfg().get("COOKIE_MAX_AGE_HOURS", _cfg().get("JWT_EXP_HOURS", 8)))
    return {
        "httponly": True,
        "samesite": _cfg().get("COOKIE_SAMESITE", "Lax"),
        "secure": bool(_cfg().get("COOKIE_SECURE")),
        "max_age": hours * 3600,
    }


def set_admin_cookie(resp, username: str):
    kwargs = _cookie_kwargs()
    resp.set_cookie(ADMIN_COOKIE, _issue_admin_jwt(username), **kwargs)
    return resp


def clear_admin_cookie(resp):
    kwargs = _cookie_kwargs()
    kwargs["max_age"] = 0
    resp.set_cookie(ADMIN_COOKIE, "", expires=0, **kwargs)
    return resp


def issue_csrf(resp):
    token = secrets.token_urlsafe(24)
    kwargs = _cookie_kwargs()
    kwargs["httponly"] = False
    resp.set_cookie(CSRF_COOKIE, token, **kwargs)
    return resp, token


def require_bot_token(fn: Callable):
    @wraps(fn)
    def wrapper(*a, **kw):
        if not has_valid_bot_token():
            return jsonify({"status": "error", "message": "unauthorized"}), 401
        return fn(*a, **kw)

    return wrapper


def require_admin(fn: Callable):
    @wraps(fn)
    def wrapper(*a, **kw):
        if not is_admin_cookie_valid():
            return jsonify({"status": "error", "message": "unauthorized"}), 401
        return fn(*a, **kw)

    return wrapper


def require_bot_or_admin(fn: Callable):
    @wraps(fn)
    def wrapper(*a, **kw):
        if has_valid_bot_token() or is_admin_cookie_valid():
            return fn(*a, **kw)
        return jsonify({"status": "error", "message": "unauthorized"}), 401

    return wrapper


def require_csrf(fn: Callable):
    @wraps(fn)
    def wrapper(*a, **kw):
        if has_valid_bot_token():
            return fn(*a, **kw)
        if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
            return fn(*a, **kw)
        cookie = request.cookies.get(CSRF_COOKIE)
        header = request.headers.get(CSRF_HEADER)
        if not cookie or not header or cookie != header:
            return jsonify({"status": "error", "message": "bad_csrf"}), 403
        return fn(*a, **kw)

    return wrapper
