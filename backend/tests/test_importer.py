"""Importer tests. They use tests/fixtures/demo_program.xlsx: made-up data, same tab layout."""

from pathlib import Path

import openpyxl
import pytest
from sqlalchemy import func, select

from app import importer
from app.models import (
    CardioEntry,
    Exclusion,
    Exercise,
    Note,
    ProgramDay,
    ProgramSlot,
    ProgramVersion,
    Swap,
)
from tests.conftest import FIXTURES

DEMO = FIXTURES / "demo_program.xlsx"


def slots(db, key):
    day = db.scalar(select(ProgramDay).where(ProgramDay.key == key))
    return {s.key: s for s in day.slots}


@pytest.fixture
def imported(db, tmp_path):
    report = tmp_path / "obstacles.md"
    version, parsed = importer.run(db, DEMO, report)
    return version, parsed, report


def test_parsers() -> None:
    t = importer.parse_target("30 s / side")
    assert (t.measure, t.lo, t.hi, t.per_side) == ("seconds", 30, 30, True)
    t = importer.parse_target("8-10 / side")
    assert (t.measure, t.lo, t.hi, t.per_side) == ("reps", 8, 10, True)
    assert importer.parse_target("6-8 + 10-12 s hold on last rep") is None
    assert importer.parse_sets("2-3") == (2, 3)
    assert importer.parse_dose("2-3 x 10-12")[0] == (2, 3)
    assert importer.either_or("Seated DB or Machine Shoulder Press") == [
        "Seated DB Shoulder Press",
        "Seated Machine Shoulder Press",
    ]
    assert importer.split_cap("One. CAP 90 LB. Two.") == ("One. Two.", "CAP 90 LB.", 90.0)
    assert importer.treadmill_settings("Incline 4.0 @ 2.0 MPH") == {
        "incline": 4.0,
        "speed_mph": 2.0,
    }


def test_version_and_days(db, imported) -> None:
    version, _, _ = imported
    assert version.label == "v9.1" and version.active
    assert [d.key for d in version.days] == ["gym1", "gym2", "gym3", "sat", "sun"]
    assert [d.weekday for d in version.days] == [0, 2, 3, 5, 6]


def test_session_order_blocks(db, imported) -> None:
    day = slots(db, "gym1")
    ordered = sorted(day.values(), key=lambda s: s.position)
    blocks = [s.block for s in ordered]
    assert blocks == sorted(blocks, key=["warmup", "main", "core", "forearm", "cooldown"].index)
    assert [s.code for s in ordered] == [
        "WU", "1", "2", "3", "4", "OPT", "C1", "C2", "F1", "F2", "CD"
    ]  # fmt: skip
    assert not any(s.block == "forearm" for s in slots(db, "gym2").values())  # Wednesday


def test_slot_details(db, imported) -> None:
    day = slots(db, "gym1")
    assert day["WU"].loggable is False and day["CD"].block == "cooldown"
    assert (day["C1"].measure, day["C1"].per_side, day["C1"].target_min) == ("reps", True, 10)
    assert (day["C2"].measure, day["C2"].per_side, day["C2"].target_max) == ("seconds", True, 30)
    y = day["4"]
    assert y.target_min is None and y.target_text.startswith("6-8 +") and y.loggable
    opt = day["OPT1"]
    assert opt.optional and (opt.sets_min, opt.sets_max) == (2, 3)
    either = day["3"]
    assert either.exercise.name == "Seated Demo Press"
    assert either.alt_exercise.name == "Seated Machine Press"
    assert db.scalar(select(Exercise).where(Exercise.name == "Assisted Demo Pull-Up")).assisted
    assert not db.scalar(select(Exercise).where(Exercise.name == "Demo Dips")).assisted


def test_weekend(db, imported) -> None:
    sat = slots(db, "sat")
    assert all(s.optional for k, s in sat.items() if k.startswith("OPT"))
    assert sat["1"].block == "warmup" and not sat["1"].loggable
    sun = slots(db, "sun")
    assert sun["2"].block == "cooldown"
    assert not sun["3"].loggable  # "3 descending sets (5-3-1)" is not guessed at
    sat_day = db.scalar(select(ProgramDay).where(ProgramDay.key == "sat"))
    assert [(c.mode, c.minutes_min) for c in sat_day.cardio] == [
        ("Air Bike", 20),
        ("Incline Treadmill Walk", 20),
    ]
    assert sat_day.cardio[1].settings == {"incline": 4.0, "speed_mph": 2.0}


def test_cardio_line(db, imported) -> None:
    gym1 = db.scalar(select(ProgramDay).where(ProgramDay.key == "gym1"))
    assert [(c.mode, c.minutes_min, c.settings) for c in gym1.cardio] == [
        ("Air bike", 10, {"note": "demo note"}),
        ("Incline walk", 15, {"incline": 4.0, "speed_mph": 2.0}),
    ]


def test_notes_and_cap(db, imported) -> None:
    squat = db.scalar(select(Exercise).where(Exercise.name == "Demo Squat"))
    notes = db.scalars(select(Note).where(Note.exercise_id == squat.id)).all()
    kinds = {n.kind: n for n in notes}
    assert kinds["cap"].cap_lb == 100 and kinds["cap"].text == "CAP 100 LB."
    assert "CAP" not in kinds["cue"].text


def test_swaps_and_exclusions(db, imported) -> None:
    pulldown = db.scalar(select(Exercise).where(Exercise.name == "Demo Pulldown — wide grip"))
    swaps = db.scalars(select(Swap).where(Swap.exercise_id == pulldown.id).order_by(Swap.rank))
    assert [(s.rank, s.substitute.name) for s in swaps] == [
        (1, "Demo Machine Pulldown"),
        (2, "Demo Row"),
    ]
    excl = {e.exercise.name: e for e in db.scalars(select(Exclusion))}
    assert excl["Demo Shrug"].kind == "goal"
    assert excl["Demo Jump, demo hop"].kind == "spine_joint"
    assert "Demo Leg Curl" not in excl  # in the program: flagged, not excluded


def test_obstacles_report(imported) -> None:
    _, parsed, report = imported
    body = report.read_text(encoding="utf-8")
    for expected in [
        "6-8 + 10-12 s hold",
        "Optional supersets",
        "Reference sections",
        "DAILY HOME BLOCK",
        "Demo Extras",
        "A or Demo B",
        "1 core slot(s) on Thu",
        "names a different version",
        "Same name as an exercise in the program",
    ]:
        assert expected in body, expected


def test_report_keeps_manual_notes(db, tmp_path) -> None:
    report = tmp_path / "obstacles.md"
    importer.run(db, DEMO, report)
    report.write_text(report.read_text(encoding="utf-8") + "\nMy own note.\n", encoding="utf-8")
    importer.run(db, DEMO, report)
    assert report.read_text(encoding="utf-8").endswith("My own note.\n")


def test_reimport_updates_in_place(db, imported) -> None:
    def counts():
        return [
            db.scalar(select(func.count()).select_from(m))
            for m in (ProgramVersion, ProgramDay, ProgramSlot, CardioEntry, Swap, Exclusion, Note)
        ]

    before = counts()
    slot_ids = {s.id for s in db.scalars(select(ProgramSlot))}
    importer.run(db, DEMO, None)
    assert counts() == before
    assert {s.id for s in db.scalars(select(ProgramSlot))} == slot_ids  # stable for old logs


def test_forearm_disagreement_flagged(db, tmp_path: Path) -> None:
    wb = openpyxl.load_workbook(DEMO)
    wb["Program Overview"]["B6"] = "Made-up line: on Mon / Tue / Thu."
    changed = tmp_path / "changed.xlsx"
    wb.save(changed)
    parsed = importer.parse_workbook(changed)
    assert any("Forearm days" in o.what for o in parsed.obstacles)


def test_forearm_on_wednesday_flagged(db, tmp_path: Path) -> None:
    wb = openpyxl.load_workbook(DEMO)
    ws = wb["Gym 2 — Legs (Wed)"]
    ws.insert_rows(9)
    for col, value in enumerate(
        ["F1", "Demo Wrist Curl", "Wrist flexors", "2", "15-20", None, None], start=1
    ):
        ws.cell(row=9, column=col, value=value)
    changed = tmp_path / "changed.xlsx"
    wb.save(changed)
    parsed = importer.parse_workbook(changed)
    assert any("Wednesday" in o.what for o in parsed.obstacles)
