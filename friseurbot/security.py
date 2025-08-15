"""
Security utilities for Bot (shared secret) and Admin UI (JWT-in-cookie + CSRF).

This module provides:
- Bot auth via a shared header token (X-Bot-Token)
- Admin auth via a JWT stored in an HttpOnly cookie
- Optional CSRF protection for state-changing UI requests
- Decorators: require_bot_token, require_admin, require_bot_or_admin, require_csrf

Environment variables:
    BOT_TOKEN            : shared secret for Bot header (default: "change-me")
    JWT_SECRET           : secret for signing admin JWTs (default: "change-me-too")
    JWT_EXP_HOURS        : admin token expiration in hours (default: "8")
    JWT_LEEWAY_SECONDS   : leeway seconds when validating JWT (default: "10")
    COOKIE_SECURE        : "1" to set cookies as secure (default: "0" for LAN HTTP)
    COOKIE_SAMESITE      : SameSite policy, e.g. "Lax" or "Strict" (default: "Lax")
    COOKIE_MAX_AGE_HOURS : cookie max-age in hours (default: "8")
"""

import datetime
import os
import secrets
from functools import wraps

import jwt
from flask import jsonify, make_response, request

# -----------------------------
# Constants / Configuration
# -----------------------------

# Bot header name
BOT_HEADER_NAME = "X-Bot-Token"
BOT_TOKEN = os.getenv("BOT_TOKEN", "change-me")

# Admin JWT cookie name and settings
ADMIN_COOKIE_NAME = "admin_token"
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-too")
JWT_EXP_HOURS = int(os.getenv("JWT_EXP_HOURS", "8"))
JWT_LEEWAY_SECONDS = int(os.getenv("JWT_LEEWAY_SECONDS", "10"))

# CSRF cookie/header names
CSRF_COOKIE = "csrf_token"
CSRF_HEADER = "X-CSRF-Token"

# Cookie security attributes (LAN defaults are permissive)
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "0") == "1"  # set "1" in HTTPS
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "Lax")  # "Lax" or "Strict"
COOKIE_MAX_AGE_HOURS = int(os.getenv("COOKIE_MAX_AGE_HOURS", str(JWT_EXP_HOURS)))
COOKIE_MAX_AGE = COOKIE_MAX_AGE_HOURS * 3600


# -----------------------------
# Helpers: who is calling?
# -----------------------------


def has_valid_bot_token() -> bool:
    """Return True if the current request presents a valid Bot header token."""
    return request.headers.get(BOT_HEADER_NAME) == BOT_TOKEN


def _issue_admin_jwt(username: str) -> str:
    """Create a signed JWT for admin with an expiration."""
    payload = {
        "sub": username,
        "role": "admin",
        "iat": datetime.datetime.utcnow(),
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=JWT_EXP_HOURS),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    # PyJWT may return bytes in older versions; ensure string
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    return token


def _decode_admin_jwt(token: str):
    """Decode and validate admin JWT with a small leeway for clock skew."""
    return jwt.decode(
        token,
        JWT_SECRET,
        algorithms=["HS256"],
        leeway=datetime.timedelta(seconds=JWT_LEEWAY_SECONDS),
    )


def is_admin_cookie_valid() -> bool:
    """Return True if an admin JWT cookie exists and is valid."""
    token = request.cookies.get(ADMIN_COOKIE_NAME)
    if not token:
        return False
    try:
        claims = _decode_admin_jwt(token)
        return claims.get("role") == "admin"
    except Exception:
        return False


def auth_context() -> dict:
    """
    Return a small context about the current caller for optional logging/logic:
        {
          "bot": True/False,
          "admin": True/False
        }
    """
    return {
        "bot": has_valid_bot_token(),
        "admin": is_admin_cookie_valid(),
    }


# -----------------------------
# Cookie helpers
# -----------------------------


def set_admin_cookie(resp, username: str):
    """
    Set the admin JWT cookie on the given response.
    Note: For HTTPS deployments set COOKIE_SECURE=1.
    """
    token = _issue_admin_jwt(username)
    resp.set_cookie(
        ADMIN_COOKIE_NAME,
        token,
        httponly=True,
        samesite=COOKIE_SAMESITE,
        secure=COOKIE_SECURE,
        max_age=COOKIE_MAX_AGE,
    )
    return resp


def clear_admin_cookie(resp):
    """Clear the admin JWT cookie."""
    resp.set_cookie(
        ADMIN_COOKIE_NAME,
        "",
        expires=0,
        httponly=True,
        samesite=COOKIE_SAMESITE,
        secure=COOKIE_SECURE,
    )
    return resp


# -----------------------------
# Decorators
# -----------------------------


def require_bot_token(fn):
    """Allow only Bot calls authenticated via shared header token."""

    @wraps(fn)
    def wrapper(*a, **kw):
        if not has_valid_bot_token():
            return jsonify({"status": "error", "message": "unauthorized"}), 401
        return fn(*a, **kw)

    return wrapper


def require_admin(fn):
    """Allow only Admin UI calls authenticated via admin JWT cookie."""

    @wraps(fn)
    def wrapper(*a, **kw):
        if not is_admin_cookie_valid():
            return jsonify({"status": "error", "message": "unauthorized"}), 401
        return fn(*a, **kw)

    return wrapper


def require_bot_or_admin(fn):
    """
    Allow calls from either Bot (shared header token) or Admin UI (cookie).
    Useful for shared endpoints used by both Bot and Admin.
    """

    @wraps(fn)
    def wrapper(*a, **kw):
        if has_valid_bot_token() or is_admin_cookie_valid():
            return fn(*a, **kw)
        return jsonify({"status": "error", "message": "unauthorized"}), 401

    return wrapper


# -----------------------------
# CSRF protection (UI only)
# -----------------------------


def issue_csrf(resp):
    """
    Issue a CSRF token for the Admin UI.
    Bot is exempt from CSRF, as it authenticates via header secret.
    """
    token = secrets.token_urlsafe(24)
    # CSRF must be readable by JS, hence httponly=False
    resp.set_cookie(
        CSRF_COOKIE,
        token,
        httponly=False,
        samesite=COOKIE_SAMESITE,
        secure=COOKIE_SECURE,
        max_age=COOKIE_MAX_AGE,
    )
    return resp, token


def _is_state_changing_request() -> bool:
    """Return True if method is considered state-changing for CSRF purposes."""
    return request.method in ("POST", "PUT", "PATCH", "DELETE")


def require_csrf(fn):
    """
    Enforce CSRF only for state-changing UI requests.
    Bot calls are exempt (header token is considered sufficient).
    """

    @wraps(fn)
    def wrapper(*a, **kw):
        # Skip CSRF if Bot header is present and valid
        if has_valid_bot_token():
            return fn(*a, **kw)

        # Only enforce for state-changing methods
        if not _is_state_changing_request():
            return fn(*a, **kw)

        cookie = request.cookies.get(CSRF_COOKIE)
        header = request.headers.get(CSRF_HEADER)
        if not cookie or not header or cookie != header:
            return jsonify({"status": "error", "message": "bad_csrf"}), 403

        return fn(*a, **kw)

    return wrapper
