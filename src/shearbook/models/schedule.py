from datetime import date, time
from enum import StrEnum

from sqlalchemy import Date, Enum, ForeignKey, Integer, String, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from shearbook.models.base import Base


class ExceptionType(StrEnum):
    OFF = "OFF"
    CUSTOM = "CUSTOM"


class StylistWeeklyHour(Base):
    __tablename__ = "stylist_weekly_hours"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    stylist_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("stylists.id", ondelete="CASCADE"), nullable=False
    )
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)  # Monday=0
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)

    stylist = relationship("Stylist", back_populates="weekly_hours")

    __table_args__ = (
        UniqueConstraint("stylist_id", "weekday", "start_time", "end_time", name="uq_weekly_slot"),
    )


class StylistException(Base):
    __tablename__ = "stylist_exceptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    stylist_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("stylists.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    type: Mapped[ExceptionType] = mapped_column(Enum(ExceptionType), nullable=False)
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    stylist = relationship("Stylist", back_populates="exceptions")

    __table_args__ = (
        UniqueConstraint(
            "stylist_id",
            "date",
            "type",
            "start_time",
            "end_time",
            name="uq_exception",
        ),
    )
