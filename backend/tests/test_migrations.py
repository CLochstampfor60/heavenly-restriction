from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine

from app.models import Base

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


def test_migrations_match_models(tmp_path: Path) -> None:
    url = f"sqlite:///{(tmp_path / 'm.db').as_posix()}"
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")
    engine = create_engine(url)
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    assert diff == []
    command.downgrade(cfg, "base")
    engine.dispose()


def test_0006_turns_the_old_rest_flag_into_a_mode(tmp_path: Path) -> None:
    import json

    url = f"sqlite:///{(tmp_path / 'r.db').as_posix()}"
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "0005")
    engine = create_engine(url)
    for old, expected in ((False, "off"), (True, "set")):
        with engine.begin() as conn:
            conn.exec_driver_sql("DELETE FROM account_setting")
            conn.exec_driver_sql(
                "INSERT INTO account_setting (key, value) VALUES ('rest_timer', ?)",
                (json.dumps({"v": old}),),
            )
        command.upgrade(cfg, "0006")
        with engine.connect() as conn:
            rows = dict(conn.exec_driver_sql("SELECT key, value FROM account_setting").fetchall())
        assert set(rows) == {"rest_timer_mode"}
        assert json.loads(rows["rest_timer_mode"]) == {"v": expected}
        command.downgrade(cfg, "0005")
        with engine.connect() as conn:
            rows = dict(conn.exec_driver_sql("SELECT key, value FROM account_setting").fetchall())
        assert json.loads(rows["rest_timer"]) == {"v": old}
    engine.dispose()
