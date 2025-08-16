import logging
import os
import traceback

from flask import Flask, jsonify
from flask_cors import CORS

from friseurbot.api.appointments import appointments_api
from friseurbot.api.auth import auth_api
from friseurbot.api.blacklist import blacklist_api
from friseurbot.api.dashboard import stats_api
from friseurbot.api.free_times import free_times_api
from friseurbot.api.friseur import friseur_api
from friseurbot.api.services import services_api
from friseurbot.api.sessions import sessions_api
from friseurbot.api.settings import settings_api
from friseurbot.utils.db.manager import remove_session

app = Flask(__name__)

# CORS configuration:
# - Admin UI runs locally (Vite/build) and needs credentials to send HttpOnly cookies.
# - Bot does server-to-server calls and does NOT require CORS.
ALLOWED = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",")

# Important: supports_credentials=True is required for browser cookies.
CORS(app, resources={r"/*": {"origins": ALLOWED}}, supports_credentials=True)

# Register Blueprints (shared API for Bot & Admin UI)
app.register_blueprint(blacklist_api)
app.register_blueprint(sessions_api)
app.register_blueprint(appointments_api)
app.register_blueprint(free_times_api)
app.register_blueprint(services_api)
app.register_blueprint(auth_api)
app.register_blueprint(stats_api)
app.register_blueprint(settings_api)
app.register_blueprint(friseur_api)


# Ensure SQLAlchemy scoped_session is removed at the end of each app context.
@app.teardown_appcontext
def shutdown_session(exception=None):
    """
    Teardown hook to remove SQLAlchemy scoped_session.
    Prevents connection leaks in long-running processes.
    """
    remove_session()


@app.errorhandler(Exception)
def handle_unexpected_error(e):
    logging.exception("Unhandled exception: %s", e)  # traceback کامل در journal
    return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == "__main__":
    # Development server. In production use gunicorn/uwsgi behind Nginx.
    app.run(host="127.0.0.1", port=8000, debug=os.getenv("FLASK_DEBUG") == "1")
