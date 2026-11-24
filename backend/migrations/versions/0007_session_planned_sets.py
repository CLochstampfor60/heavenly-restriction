"""session planned sets

Today's planned set count per exercise ("+ Add set" / "Remove set" on the exercise page).
NULL means the program's count. The program itself is unchanged.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-23 20:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | Sequence[str] | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("session_slot") as batch:
        batch.add_column(sa.Column("planned_sets", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("session_slot") as batch:
        batch.drop_column("planned_sets")
