# SQLAlchemy
from sqlalchemy import Column
from sqlalchemy import Date
from sqlalchemy import ForeignKey
from sqlalchemy import Integer
from sqlalchemy import String
from sqlalchemy import Time
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

# Friseurbot
from friseurbot.entity.base import Base


class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True)
    reservation_code = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    service_id = Column(Integer, ForeignKey("services.id"), nullable=False)
    date = Column(Date, nullable=False)
    time = Column(Time, nullable=False)
    google_event_id = Column(String)
    friseur_id = Column(Integer, ForeignKey("friseure.id"), nullable=False)

    service = relationship("Service", back_populates="appointments")
    friseur = relationship("Friseur", back_populates="appointments")
