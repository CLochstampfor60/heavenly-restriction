"""session timing

When Start workout and Finish workout were tapped, for the workout's duration (with the set
timestamps already stored). NULL when not tapped or recorded before this version.

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-23 21:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | Sequence[str] | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("workout_session") as batch:
        batch.add_column(sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("workout_session") as batch:
        batch.drop_column("finished_at")
        batch.drop_column("started_at")
