from datetime import datetime, timedelta

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from shearbook.models.base import Base


def _default_expiry() -> datetime:
    return datetime.now() + timedelta(minutes=60)


class ChatSession(Base):
    """WhatsApp conversation state, keyed by chat id."""

    __tablename__ = "chat_sessions"

    chat_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    step: Mapped[str | None] = mapped_column(String(80), nullable=True)
    code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, onupdate=datetime.now
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, default=_default_expiry)
