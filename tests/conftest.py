from __future__ import annotations

from datetime import time

import pytest

from shearbook.app import create_app
from shearbook.db.seed import seed_services, seed_settings
from shearbook.db.session import dispose_engine, get_session, session_scope
from shearbook.holidays import clear_holiday_cache
from shearbook.models import Stylist, StylistWeeklyHour
from shearbook.settings_svc import clear_settings_cache
from shearbook.users import create_admin


@pytest.fixture()
def app():
    application = create_app(
        test_config={
            "TESTING": True,
            "DATABASE_URL": "sqlite:///:memory:",
            "SECRET_KEY": "test-secret-key-32-bytes-minimum!!",
            "JWT_SECRET": "test-jwt-secret-32-bytes-minimum!!!",
            "BOT_TOKEN": "test-bot-token",
            "CALENDAR_BACKEND": "local",
            "TIMEZONE": "Europe/Berlin",
            "HOLIDAY_COUNTRY": "DE",
            "HOLIDAY_REGION": "BW",
            "RESERVATION_PREFIX": "SB",
            "SLOT_STEP_MIN": 30,
            "COOKIE_SECURE": False,
            "CREATE_SCHEMA": True,
        }
    )
    clear_settings_cache()
    clear_holiday_cache()
    with application.app_context():
        with session_scope() as session:
            seed_settings(session)
            seed_services(session)
            create_admin(session, "admin", "password123")
        yield application
    dispose_engine()
    clear_settings_cache()
    clear_holiday_cache()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def auth_client(app):
    client = app.test_client()
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "password123"})
    assert resp.status_code == 200
    return client


@pytest.fixture()
def csrf_headers(auth_client):
    cookie = auth_client.get_cookie("csrf_token")
    assert cookie is not None
    return {"X-CSRF-Token": cookie.value}


@pytest.fixture()
def bot_headers():
    return {"X-Bot-Token": "test-bot-token"}


@pytest.fixture()
def stylist(app):
    """Active stylist with Mon-Fri 09:00-17:00 and a local calendar."""
    from shearbook.calendar.local import LocalCalendar
    from shearbook.models import Service

    with app.app_context():
        session = get_session()
        calendar = LocalCalendar(session)
        row = Stylist(name="Alex", active=True)
        session.add(row)
        session.flush()
        row.calendar_id = calendar.create_calendar("Alex", "Europe/Berlin")
        for weekday in range(5):
            session.add(
                StylistWeeklyHour(
                    stylist_id=row.id,
                    weekday=weekday,
                    start_time=time(9, 0),
                    end_time=time(17, 0),
                )
            )
        services = session.query(Service).all()
        row.services = list(services)
        session.commit()
        data = {"id": row.id, "calendar_id": row.calendar_id, "name": row.name}
        return data
