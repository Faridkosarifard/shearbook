from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True)
class BusyInterval:
    start: datetime
    end: datetime


@dataclass
class CalendarEventData:
    event_id: str
    calendar_id: str
    summary: str
    description: str
    start: datetime
    end: datetime


class CalendarBackend(Protocol):
    def create_calendar(self, name: str, timezone: str) -> str: ...

    def delete_calendar(self, calendar_id: str) -> None: ...

    def list_busy(self, calendar_id: str, start: datetime, end: datetime) -> list[BusyInterval]: ...

    def create_event(
        self,
        calendar_id: str,
        summary: str,
        description: str,
        start: datetime,
        end: datetime,
        timezone: str,
    ) -> str: ...

    def update_event(
        self,
        calendar_id: str,
        event_id: str,
        summary: str,
        description: str,
        start: datetime,
        end: datetime,
        timezone: str,
    ) -> str: ...

    def delete_event(self, calendar_id: str, event_id: str) -> None: ...

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
    ) -> str: ...
