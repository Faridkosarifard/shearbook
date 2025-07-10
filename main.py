from flask import Flask
from flask_cors import CORS

from api.appointments import appointments_api
from api.auth import auth_api
from api.blacklist import blacklist_api
from api.dashboard import stats_api
from api.free_times import free_times_api
from api.friseur import friseur_api
from api.services import services_api
from api.sessions import sessions_api
from api.settings import settings_api

app = Flask(__name__)
CORS(app)

app.register_blueprint(blacklist_api)
app.register_blueprint(sessions_api)
app.register_blueprint(appointments_api)
app.register_blueprint(free_times_api)
app.register_blueprint(services_api)
app.register_blueprint(auth_api)
app.register_blueprint(stats_api)
app.register_blueprint(settings_api)
app.register_blueprint(friseur_api)

if __name__ == "__main__":
    app.run(debug=True)
