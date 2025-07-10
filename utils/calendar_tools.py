from datetime import datetime, time, timedelta

import pytz
from dateutil import parser
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from utils.auth_google import get_credentials
from utils.db import get_setting

SCOPES = ["https://www.googleapis.com/auth/calendar"]


def get_free_slots(date_str, duration_min, calendar_id):
    creds = get_credentials()
    service = build("calendar", "v3", credentials=creds)

    date = datetime.strptime(date_str, "%Y-%m-%d").date()
    tz = pytz.timezone("Europe/Berlin")

    setting_start_time = get_setting("business_hours_start")
    setting_end_time = get_setting("business_hours_end")

    start_time = datetime.strptime(setting_start_time, "%H:%M").time() or time(9, 0)
    end_time = datetime.strptime(setting_end_time, "%H:%M").time() or time(18, 0)

    start_of_day = tz.localize(datetime.combine(date, start_time))
    end_of_day = tz.localize(datetime.combine(date, end_time))

    events_result = (
        service.events()
        .list(
            calendarId=calendar_id,
            timeMin=start_of_day.isoformat(),
            timeMax=end_of_day.isoformat(),
            singleEvents=True,
            orderBy="startTime",
            timeZone="Europe/Berlin",
        )
        .execute()
    )

    events = events_result.get("items", [])
    busy_times = []

    for event in events:
        start = event["start"].get("dateTime")
        end = event["end"].get("dateTime")
        if start and end:
            busy_times.append((parser.isoparse(start), parser.isoparse(end)))

    busy_times.append((end_of_day, end_of_day))

    free_slots = []
    current = start_of_day
    step = timedelta(minutes=duration_min)

    for busy_start, busy_end in sorted(busy_times):
        while current + step <= busy_start:
            free_slots.append(current.time().strftime("%H:%M"))
            current += step
        current = max(current, busy_end)

    return free_slots


def create_calendar_for_friseur(friseur_name):
    creds = get_credentials()
    service = build("calendar", "v3", credentials=creds)

    calendar = {"summary": f"Friseur – {friseur_name}", "timeZone": "Europe/Berlin"}

    created_calendar = service.calendars().insert(body=calendar).execute()
    return created_calendar["id"]
