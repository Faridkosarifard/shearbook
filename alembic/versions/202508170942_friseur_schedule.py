"""add friseur schedule tables

Revision ID: 202508170942_friseur_schedule
Revises: 0252613e9006
Create Date: 2025-08-17 09:42:16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '202508170942_friseur_schedule'
down_revision: Union[str, Sequence[str], None] = '0252613e9006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_table(
        "friseur_weekly_hours",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("friseur_id", sa.Integer(), sa.ForeignKey("friseure.id", ondelete="CASCADE"), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
    )
    op.create_unique_constraint("uq_weekly_slot", "friseur_weekly_hours", ["friseur_id", "weekday", "start_time", "end_time"])

    op.create_table(
        "friseur_exceptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("friseur_id", sa.Integer(), sa.ForeignKey("friseure.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("type", sa.Enum("OFF", "CUSTOM", name="exceptiontype"), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=True),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.Column("note", sa.String(), nullable=True),
    )
    op.create_unique_constraint("uq_exception", "friseur_exceptions", ["friseur_id", "date", "type", "start_time", "end_time"])

def downgrade():
    op.drop_constraint("uq_exception", "friseur_exceptions", type_="unique")
    op.drop_table("friseur_exceptions")
    op.drop_constraint("uq_weekly_slot", "friseur_weekly_hours", type_="unique")
    op.drop_table("friseur_weekly_hours")
