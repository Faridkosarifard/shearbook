# SQLAlchemy
from sqlalchemy import Boolean
from sqlalchemy import Column
from sqlalchemy import Integer
from sqlalchemy import String
from sqlalchemy.orm import relationship

# Friseurbot
from friseurbot.entity.base import Base
from friseurbot.entity.friseur_service import friseur_service


class Friseur(Base):
    __tablename__ = "friseure"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    active = Column(Boolean, default=True)
    calendar_id = Column(String, nullable=True)

    appointments = relationship(
        "Appointment", back_populates="friseur", lazy="selectin"
    )

    services = relationship(
        "Service",
        secondary=friseur_service,
        back_populates="friseure",
        lazy="selectin",
    )
