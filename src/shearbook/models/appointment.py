from datetime import date, time

from sqlalchemy import Date, ForeignKey, Integer, String, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from shearbook.models.base import Base


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reservation_code: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    service_id: Mapped[int] = mapped_column(Integer, ForeignKey("services.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    time: Mapped[time] = mapped_column(Time, nullable=False)
    calendar_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stylist_id: Mapped[int] = mapped_column(Integer, ForeignKey("stylists.id"), nullable=False)

    service = relationship("Service", back_populates="appointments")
    stylist = relationship("Stylist", back_populates="appointments")
