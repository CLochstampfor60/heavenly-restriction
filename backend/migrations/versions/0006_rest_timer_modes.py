"""rest timer modes

Rest timer becomes a choice (off / after every set / after each exercise) with a default rest,
and a session can turn it on or off for that day only.

- workout_session.rest_timer: "on", "off" or NULL (follow the account setting).
- account_setting: the old on/off "rest_timer" row becomes "rest_timer_mode" (false -> "off",
  true -> "set"). No row means the default ("set").

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-23 19:30:00.000000

"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | Sequence[str] | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

settings = sa.table("account_setting", sa.column("key", sa.String), sa.column("value", sa.JSON))


def _move(old: str, new: str, convert) -> None:
    bind = op.get_bind()
    row = bind.execute(sa.select(settings.c.value).where(settings.c.key == old)).first()
    if row is None:
        return
    value = row[0] if isinstance(row[0], dict) else json.loads(row[0])
    bind.execute(settings.delete().where(settings.c.key == new))
    bind.execute(settings.insert().values(key=new, value={"v": convert(value.get("v"))}))
    bind.execute(settings.delete().where(settings.c.key == old))


def upgrade() -> None:
    with op.batch_alter_table("workout_session") as batch:
        batch.add_column(sa.Column("rest_timer", sa.String(length=8), nullable=True))
    _move("rest_timer", "rest_timer_mode", lambda on: "set" if on else "off")


def downgrade() -> None:
    _move("rest_timer_mode", "rest_timer", lambda mode: mode != "off")
    with op.batch_alter_table("workout_session") as batch:
        batch.drop_column("rest_timer")
