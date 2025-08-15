from sqlalchemy import Column, Integer, String

from friseurbot.entity.base import Base


class Blacklist(Base):
    __tablename__ = "blacklist"

    id = Column(Integer, primary_key=True)
    phone = Column(String, nullable=True, unique=True, index=True)
