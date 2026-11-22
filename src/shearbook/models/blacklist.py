from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from shearbook.models.base import Base


class Blacklist(Base):
    __tablename__ = "blacklist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
