# SQLAlchemy
from sqlalchemy import Column
from sqlalchemy import ForeignKey
from sqlalchemy import Integer
from sqlalchemy import Table
from sqlalchemy import UniqueConstraint

# Friseurbot
from friseurbot.entity.base import Base

friseur_service = Table(
    "friseur_service",
    Base.metadata,
    Column(
        "friseur_id",
        Integer,
        ForeignKey("friseure.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "service_id",
        Integer,
        ForeignKey("services.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    UniqueConstraint("friseur_id", "service_id", name="uq_friseur_service"),
)
