from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from shearbook.models.base import Base


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
