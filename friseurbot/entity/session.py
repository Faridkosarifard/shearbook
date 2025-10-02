# Standard library
from datetime import datetime
from datetime import timedelta

# SQLAlchemy
from sqlalchemy import JSON
from sqlalchemy import Column
from sqlalchemy import DateTime
from sqlalchemy import String

# Friseurbot
from friseurbot.entity.base import Base


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
