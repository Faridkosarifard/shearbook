from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from shearbook.models.base import Base
from shearbook.models.service import stylist_service


class Stylist(Base):
    __tablename__ = "stylists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    calendar_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    appointments = relationship("Appointment", back_populates="stylist", lazy="selectin")
    services = relationship(
        "Service",
        secondary=stylist_service,
        back_populates="stylists",
        lazy="selectin",
    )
    weekly_hours = relationship(
        "StylistWeeklyHour",
        back_populates="stylist",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    exceptions = relationship(
        "StylistException",
        back_populates="stylist",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
