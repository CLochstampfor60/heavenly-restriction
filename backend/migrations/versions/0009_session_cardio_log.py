"""session cardio log

What was actually done on each cardio item of a session (type, minutes, incline, mph, level),
keyed like the Done / Skip ticks (cardio1, cardio2, ...). Progress counts these minutes.

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-23 21:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | Sequence[str] | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("workout_session") as batch:
        batch.add_column(sa.Column("cardio_log", sa.JSON(), nullable=False, server_default="{}"))


def downgrade() -> None:
    with op.batch_alter_table("workout_session") as batch:
        batch.drop_column("cardio_log")
