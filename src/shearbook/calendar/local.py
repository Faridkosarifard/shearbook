"""Database-backed calendar used for tests and Raspberry Pi installs without Google."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from shearbook.calendar.base import BusyInterval
from shearbook.models import CalendarEvent


class LocalCalendar:
    def __init__(self, session: Session):
        self.session = session

    def create_calendar(self, name: str, timezone: str) -> str:
        return f"local-{uuid.uuid4().hex}"

    def delete_calendar(self, calendar_id: str) -> None:
        rows = self.session.scalars(
            select(CalendarEvent).where(CalendarEvent.calendar_id == calendar_id)
        ).all()
        for row in rows:
            self.session.delete(row)

    def list_busy(self, calendar_id: str, start: datetime, end: datetime) -> list[BusyInterval]:
        rows = self.session.scalars(
            select(CalendarEvent).where(
                CalendarEvent.calendar_id == calendar_id,
                CalendarEvent.start < end,
                CalendarEvent.end > start,
            )
        ).all()
        return [BusyInterval(start=row.start, end=row.end) for row in rows if row.end > row.start]

    def create_event(
        self,
        calendar_id: str,
        summary: str,
        description: str,
        start: datetime,
        end: datetime,
        timezone: str,
    ) -> str:
        event_id = uuid.uuid4().hex
        self.session.add(
            CalendarEvent(
                calendar_id=calendar_id,
                event_id=event_id,
                summary=summary,
                description=description,
                start=start,
                end=end,
            )
        )
        self.session.flush()
        return event_id

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
        row = self.session.scalar(select(CalendarEvent).where(CalendarEvent.event_id == event_id))
        if not row:
            return self.create_event(calendar_id, summary, description, start, end, timezone)
        row.calendar_id = calendar_id
        row.summary = summary
        row.description = description
        row.start = start
        row.end = end
        self.session.flush()
        return row.event_id

    def delete_event(self, calendar_id: str, event_id: str) -> None:
        row = self.session.scalar(select(CalendarEvent).where(CalendarEvent.event_id == event_id))
        if row:
            self.session.delete(row)
            self.session.flush()

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
        return self.update_event(
            to_calendar_id, event_id, summary, description, start, end, timezone
        )
