"""Every test gets a fresh SQLite database; the real one is never touched."""

import os
from collections.abc import Iterator
from pathlib import Path

import pytest

# Before any app import: keep tests off the real database and the real spreadsheet.
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ.pop("PROGRAM_XLSX_PATH", None)

from sqlalchemy.orm import Session, sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.models import Base  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def engine():
    from sqlalchemy import create_engine, event

    eng = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(eng, "connect")
    def _fk(dbapi_connection, _record) -> None:
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine) -> Iterator[Session]:
    session = sessionmaker(bind=engine, expire_on_commit=False)()
    yield session
    session.close()


@pytest.fixture
def client(engine, db):
    """API client on the made-up demo program."""
    from fastapi.testclient import TestClient

    from app import importer
    from app.db import get_db
    from app.main import app

    importer.run(db, FIXTURES / "demo_program.xlsx", None)
    factory = sessionmaker(bind=engine, expire_on_commit=False)

    def override():
        s = factory()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override
    yield TestClient(app, client=("127.0.0.1", 50000))
    app.dependency_overrides.clear()
