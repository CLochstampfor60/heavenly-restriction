"""Every test gets a fresh SQLite database; the real one is never touched."""

import os
from collections.abc import Iterator
from pathlib import Path

import pytest

# Before any app import: keep tests off the real database and the real spreadsheet.
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ.pop("PROGRAM_XLSX_PATH", None)
# Login: tests talk to https://localhost, the WebAuthn RP ID is localhost.
os.environ["WEBAUTHN_RP_ID"] = "localhost"
os.environ["APP_ORIGINS"] = "https://localhost"
os.environ["COOKIE_SECURE"] = "1"
ORIGIN = "https://localhost"

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


def make_client(engine, signed_in: bool):
    from fastapi.testclient import TestClient

    from app import auth
    from app.db import get_db
    from app.main import app

    factory = sessionmaker(bind=engine, expire_on_commit=False)

    def override():
        s = factory()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override
    c = TestClient(app, base_url=ORIGIN, client=("127.0.0.1", 50000), headers={"Origin": ORIGIN})
    if signed_in:
        with factory() as s:
            c.cookies.set(auth.cookie_name(), auth.create_session(s, None))
    return c


@pytest.fixture
def client(engine, db):
    """Signed-in API client on the made-up demo program."""
    from app import importer
    from app.main import app

    importer.run(db, FIXTURES / "demo_program.xlsx", None)
    yield make_client(engine, signed_in=True)
    app.dependency_overrides.clear()


@pytest.fixture
def anon(engine, db):
    """Client with no session, on the demo program."""
    from app import auth, importer
    from app.main import app

    importer.run(db, FIXTURES / "demo_program.xlsx", None)
    auth.CEREMONIES.items.clear()
    auth.ENROLL_GRANTS.items.clear()
    auth.SETUP.code = None
    auth.DEVICE_CODE.item = None
    yield make_client(engine, signed_in=False)
    app.dependency_overrides.clear()
