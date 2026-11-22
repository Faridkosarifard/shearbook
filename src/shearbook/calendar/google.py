"""Google Calendar backend. Credentials live outside the repository."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from dateutil import parser
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from shearbook.calendar.base import BusyInterval


class GoogleAuthError(RuntimeError):
    pass


def load_credentials(token_path: Path, credentials_path: Path, scopes: list[str]) -> Credentials:
    creds = None
    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), scopes)
    if creds and creds.valid:
        return creds
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(creds.to_json(), encoding="utf-8")
        return creds
    raise GoogleAuthError(
        f"Google OAuth token is missing or expired at {token_path}. "
        "Run `shearbook auth-google` after placing credentials.json."
    )


def run_oauth_flow(token_path: Path, credentials_path: Path, scopes: list[str]) -> Path:
    if not credentials_path.exists():
        raise GoogleAuthError(
            f"OAuth client file not found at {credentials_path}. "
            "Download it from Google Cloud Console (Desktop app) and save it there."
        )
    flow = InstalledAppFlow.from_client_secrets_file(str(credentials_path), scopes)
    creds = flow.run_local_server(port=0)
    token_path.parent.mkdir(parents=True, exist_ok=True)
    token_path.write_text(creds.to_json(), encoding="utf-8")
    return token_path


class GoogleCalendar:
    def __init__(self, token_path: Path, credentials_path: Path, scopes: list[str]):
        self.token_path = token_path
        self.credentials_path = credentials_path
        self.scopes = scopes
        self._service = None

    def _service_client(self):
        if self._service is None:
            creds = load_credentials(self.token_path, self.credentials_path, self.scopes)
            self._service = build("calendar", "v3", credentials=creds, cache_discovery=False)
        return self._service

    def create_calendar(self, name: str, timezone: str) -> str:
        created = (
            self._service_client()
            .calendars()
            .insert(body={"summary": name, "timeZone": timezone})
            .execute()
        )
        return created["id"]

    def delete_calendar(self, calendar_id: str) -> None:
        try:
            self._service_client().calendars().delete(calendarId=calendar_id).execute()
        except HttpError:
            pass

    def list_busy(self, calendar_id: str, start: datetime, end: datetime) -> list[BusyInterval]:
        body = {
            "timeMin": start.isoformat(),
            "timeMax": end.isoformat(),
            "timeZone": str(start.tzinfo) if start.tzinfo else "UTC",
            "items": [{"id": calendar_id}],
        }
        resp = self._service_client().freebusy().query(body=body).execute()
        busy = resp.get("calendars", {}).get(calendar_id, {}).get("busy", [])
        out: list[BusyInterval] = []
        for block in busy:
            s = parser.isoparse(block["start"])
            e = parser.isoparse(block["end"])
            if e > s:
                out.append(BusyInterval(start=s, end=e))
        return out

    def create_event(
        self,
        calendar_id: str,
        summary: str,
        description: str,
        start: datetime,
        end: datetime,
        timezone: str,
    ) -> str:
        created = (
            self._service_client()
            .events()
            .insert(
                calendarId=calendar_id, body=_event_body(summary, description, start, end, timezone)
            )
            .execute()
        )
        return created["id"]

    def update_event(
        self,
        calendar_id: str,
        event_id: str,
        summary: str,
        description: str,
        start: datetime,
        end: datetime,
        timezone: str,
    ) -> str:
        try:
            self._service_client().events().patch(
                calendarId=calendar_id,
                eventId=event_id,
                body=_event_body(summary, description, start, end, timezone),
            ).execute()
            return event_id
        except HttpError:
            return self.create_event(calendar_id, summary, description, start, end, timezone)

    def delete_event(self, calendar_id: str, event_id: str) -> None:
        try:
            self._service_client().events().delete(
                calendarId=calendar_id, eventId=event_id
            ).execute()
        except HttpError:
            pass

    def move_event(
        self,
        event_id: str,
        from_calendar_id: str,
        to_calendar_id: str,
        summary: str,
        description: str,
        start: datetime,
        end: datetime,
        timezone: str,
    ) -> str:
        if from_calendar_id == to_calendar_id:
            return self.update_event(
                to_calendar_id, event_id, summary, description, start, end, timezone
            )
        new_id = self.create_event(to_calendar_id, summary, description, start, end, timezone)
        if event_id:
            self.delete_event(from_calendar_id, event_id)
        return new_id


def _event_body(
    summary: str, description: str, start: datetime, end: datetime, timezone: str
) -> dict:
    return {
        "summary": summary,
        "description": description,
        "start": {"dateTime": start.isoformat(), "timeZone": timezone},
        "end": {"dateTime": end.isoformat(), "timeZone": timezone},
    }
