from sqlalchemy import Column, ForeignKey, Integer, String, Table, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from shearbook.models.base import Base

stylist_service = Table(
    "stylist_service",
    Base.metadata,
    Column(
        "stylist_id",
        Integer,
        ForeignKey("stylists.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "service_id",
        Integer,
        ForeignKey("services.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    UniqueConstraint("stylist_id", "service_id", name="uq_stylist_service"),
)


class Service(Base):
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    duration_min: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    appointments = relationship("Appointment", back_populates="service", lazy="selectin")
    stylists = relationship(
        "Stylist",
        secondary=stylist_service,
        back_populates="services",
        lazy="selectin",
    )
