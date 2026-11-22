"""Flask application factory."""

from __future__ import annotations

import logging
from pathlib import Path

import requests
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from shearbook.config import Settings, load_settings
from shearbook.db.session import configure_engine, create_schema, remove_session
from shearbook.security import is_admin_cookie_valid
from shearbook.settings_svc import clear_settings_cache


def create_app(test_config: dict | None = None, settings: Settings | None = None) -> Flask:
    testing = bool(test_config)
    settings = settings or load_settings(testing=testing)

    app = Flask(__name__)
    app.config.update(
        SECRET_KEY=settings.secret_key,
        JWT_SECRET=settings.jwt_secret,
        BOT_TOKEN=settings.bot_token,
        DATABASE_URL=settings.database_url,
        TIMEZONE=settings.timezone,
        CUSTOMER_LOCALE=settings.customer_locale,
        HOLIDAY_COUNTRY=settings.holiday_country,
        HOLIDAY_REGION=settings.holiday_region,
        RESERVATION_PREFIX=settings.reservation_prefix,
        SLOT_STEP_MIN=settings.slot_step_min,
        CALENDAR_BACKEND=settings.calendar_backend,
        GOOGLE_CREDENTIALS_PATH=settings.google_credentials_path,
        GOOGLE_TOKEN_PATH=settings.google_token_path,
        GOOGLE_SCOPES=settings.google_scopes,
        COOKIE_SECURE=settings.cookie_secure,
        COOKIE_SAMESITE=settings.cookie_samesite,
        JWT_EXP_HOURS=settings.jwt_exp_hours,
        JWT_LEEWAY_SECONDS=settings.jwt_leeway_seconds,
        COOKIE_MAX_AGE_HOURS=settings.cookie_max_age_hours,
        ADMIN_DIST=settings.admin_dist,
        WHATSAPP_ADMIN_URL=settings.whatsapp_admin_url,
        WHATSAPP_ADMIN_TOKEN=settings.whatsapp_admin_token,
        TESTING=testing,
    )
    if test_config:
        app.config.update(test_config)

    configure_engine(app.config["DATABASE_URL"])
    if testing or app.config.get("CREATE_SCHEMA", True):
        create_schema()
    clear_settings_cache()

    CORS(
        app,
        resources={
            r"/api/*": {"origins": settings.allowed_origins},
            r"/wa/*": {"origins": settings.allowed_origins},
        },
        supports_credentials=True,
    )

    from shearbook.api.appointments import appointments_api
    from shearbook.api.auth import auth_api
    from shearbook.api.blacklist import blacklist_api
    from shearbook.api.dashboard import dashboard_api
    from shearbook.api.schedule import schedule_api
    from shearbook.api.services import services_api
    from shearbook.api.sessions import sessions_api
    from shearbook.api.settings import settings_api
    from shearbook.api.slots import slots_api
    from shearbook.api.stylist_services import stylist_services_api
    from shearbook.api.stylists import stylists_api

    app.register_blueprint(auth_api, url_prefix="/api")
    app.register_blueprint(appointments_api, url_prefix="/api")
    app.register_blueprint(slots_api, url_prefix="/api")
    app.register_blueprint(services_api, url_prefix="/api")
    app.register_blueprint(stylists_api, url_prefix="/api")
    app.register_blueprint(schedule_api, url_prefix="/api")
    app.register_blueprint(stylist_services_api, url_prefix="/api")
    app.register_blueprint(settings_api, url_prefix="/api")
    app.register_blueprint(blacklist_api, url_prefix="/api")
    app.register_blueprint(dashboard_api, url_prefix="/api")
    app.register_blueprint(sessions_api, url_prefix="/api")

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "shearbook"})

    @app.teardown_appcontext
    def _teardown(_exc):
        remove_session()

    @app.errorhandler(Exception)
    def _unhandled(err):
        app.logger.exception("Unhandled error: %s", err)
        if app.config.get("TESTING"):
            return jsonify({"status": "error", "message": str(err)}), 500
        return jsonify({"status": "error", "message": "internal_error"}), 500

    _register_whatsapp_proxy(app)
    _register_admin_static(app)
    return app


def _register_whatsapp_proxy(app: Flask) -> None:
    @app.route("/wa/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    def whatsapp_proxy(path: str):
        if not is_admin_cookie_valid():
            return jsonify({"status": "error", "message": "unauthorized"}), 401
        base = app.config.get("WHATSAPP_ADMIN_URL") or ""
        status_poll = request.method == "GET" and path.strip("/") == "status"

        def offline_status():
            # 200 keeps the admin console clean while the client is down.
            return jsonify({"status": "offline", "me": None, "qr": False})

        if not base:
            if status_poll:
                return offline_status()
            return jsonify({"status": "error", "message": "whatsapp_admin_unconfigured"}), 503
        url = f"{base}/wa/{path}"
        headers = {k: v for k, v in request.headers if k.lower() not in {"host", "content-length"}}
        token = app.config.get("WHATSAPP_ADMIN_TOKEN")
        if token and "X-Admin-Token" not in headers:
            headers["X-Admin-Token"] = token
        try:
            upstream = requests.request(
                method=request.method,
                url=url,
                params=request.args.to_dict(flat=False),
                data=request.get_data(),
                headers=headers,
                stream=True,
                timeout=30,
            )
        except requests.RequestException:
            if status_poll:
                return offline_status()
            return jsonify({"status": "error", "message": "whatsapp_bridge_unreachable"}), 503
        excluded = {"content-encoding", "content-length", "transfer-encoding", "connection"}
        response_headers = [
            (k, v) for k, v in upstream.raw.headers.items() if k.lower() not in excluded
        ]
        return upstream.content, upstream.status_code, response_headers


def _register_admin_static(app: Flask) -> None:
    dist = Path(app.config.get("ADMIN_DIST") or "")

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def admin_spa(path: str):
        if path.startswith("api/") or path.startswith("wa/"):
            return jsonify({"status": "error", "message": "not_found"}), 404
        if not dist.exists():
            return jsonify({"status": "ok", "message": "admin UI is not built yet"}), 200
        candidate = dist / path
        if path and candidate.is_file():
            return send_from_directory(dist, path)
        return send_from_directory(dist, "index.html")


def configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
