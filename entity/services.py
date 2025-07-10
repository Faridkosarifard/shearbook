from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship

from entity.base import Base


class Service(Base):
    __tablename__ = "services"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)
    duration_min = Column(Integer, nullable=False)
    position = Column(Integer, nullable=False, default=0)

    appointments = relationship("Appointment", back_populates="service", lazy="joined")
