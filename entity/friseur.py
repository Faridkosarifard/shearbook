from sqlalchemy import Boolean, Column, Integer, String
from sqlalchemy.orm import relationship

from entity.base import Base


class Friseur(Base):
    __tablename__ = "friseure"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    active = Column(Boolean, default=True)
    calendar_id = Column(String, nullable=True)

    appointments = relationship("Appointment", back_populates="friseur", lazy="joined")
