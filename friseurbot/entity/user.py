# SQLAlchemy
from sqlalchemy import Column
from sqlalchemy import Integer
from sqlalchemy import String

# Friseurbot
from friseurbot.entity.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    password = Column(String, nullable=False)
