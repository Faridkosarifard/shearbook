# friseurbot/entity/friseur_schedule.py
# Standard library
from enum import Enum as PyEnum

# SQLAlchemy
from sqlalchemy import Column
from sqlalchemy import Date
from sqlalchemy import Enum
from sqlalchemy import ForeignKey
from sqlalchemy import Integer
from sqlalchemy import String
from sqlalchemy import Time
from sqlalchemy import UniqueConstraint

# Friseurbot
from friseurbot.entity.base import Base


class FriseurWeeklyHour(Base):
    __tablename__ = "friseur_weekly_hours"
    id = Column(Integer, primary_key=True)
    friseur_id = Column(
        Integer, ForeignKey("friseure.id", ondelete="CASCADE"), nullable=False
    )
    weekday = Column(Integer, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    __table_args__ = (
        UniqueConstraint(
            "friseur_id", "weekday", "start_time", "end_time", name="uq_weekly_slot"
        ),
    )


class ExceptionType(PyEnum):
    OFF = "OFF"
    CUSTOM = "CUSTOM"


class FriseurException(Base):
    __tablename__ = "friseur_exceptions"
    id = Column(Integer, primary_key=True)
    friseur_id = Column(
        Integer, ForeignKey("friseure.id", ondelete="CASCADE"), nullable=False
    )
    date = Column(Date, nullable=False)
    type = Column(Enum(ExceptionType), nullable=False)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    note = Column(String, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "friseur_id", "date", "type", "start_time", "end_time", name="uq_exception"
        ),
    )
