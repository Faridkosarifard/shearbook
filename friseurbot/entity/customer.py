# SQLAlchemy
from sqlalchemy import Column
from sqlalchemy import Integer
from sqlalchemy import String

# Friseurbot
from friseurbot.entity.base import Base


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
