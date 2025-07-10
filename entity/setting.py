from sqlalchemy import Column, String

from entity.base import Base


class Setting(Base):
    __tablename__ = "settings"
    key = Column(String, unique=True, primary_key=True)
    value = Column(String)
