from __future__ import annotations

from flask import current_app
from sqlalchemy.orm import Session

from shearbook.calendar.google import GoogleCalendar
from shearbook.calendar.local import LocalCalendar


def get_calendar(session: Session):
    kind = (current_app.config.get("CALENDAR_BACKEND") or "local").lower()
    if kind == "google":
        return GoogleCalendar(
            token_path=current_app.config["GOOGLE_TOKEN_PATH"],
            credentials_path=current_app.config["GOOGLE_CREDENTIALS_PATH"],
            scopes=current_app.config["GOOGLE_SCOPES"],
        )
    return LocalCalendar(session)
