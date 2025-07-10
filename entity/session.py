from datetime import datetime, timedelta

from sqlalchemy import JSON, Column, DateTime, String

from entity.base import Base


class Session(Base):
    __tablename__ = "sessions"

    chat_id = Column(String, primary_key=True)
    step = Column(String)
    code = Column(String)
    data = Column(JSON, default={})
    updated_at = Column(DateTime, default=datetime.now(), onupdate=datetime.now())
    expires_at = Column(
        DateTime, default=lambda: datetime.now() + timedelta(minutes=60)
    )
