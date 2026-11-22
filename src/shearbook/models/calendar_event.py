from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from shearbook.models.base import Base


class CalendarEvent(Base):
    """Busy interval used by the local calendar backend."""

    __tablename__ = "calendar_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    calendar_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    event_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    summary: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
