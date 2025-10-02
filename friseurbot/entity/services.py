# SQLAlchemy
from sqlalchemy import Column
from sqlalchemy import Integer
from sqlalchemy import String
from sqlalchemy.orm import relationship

# Friseurbot
from friseurbot.entity.base import Base
from friseurbot.entity.friseur_service import friseur_service


class Service(Base):
    __tablename__ = "services"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)
    duration_min = Column(Integer, nullable=False)
    position = Column(Integer, nullable=False, default=0)

    appointments = relationship(
        "Appointment", back_populates="service", lazy="selectin"
    )

    friseure = relationship(
        "Friseur",
        secondary=friseur_service,
        back_populates="services",
        lazy="selectin",
    )
