"""HTTP API for today's session, the library and exercise cards.

Dates are the phone's local calendar date (YYYY-MM-DD); the server never guesses a time zone.
Writes are idempotent where the phone may retry them: sets and stops carry a client_id.
"""

from collections import defaultdict
from datetime import date as Date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    CardioEntry,
    Exclusion,
    Exercise,
    Note,
    NoteKind,
    ProgramDay,
    ProgramSlot,
    ProgramVersion,
    SessionSlot,
    SetLog,
    StopEvent,
    Swap,
    WorkoutSession,
)
from app.prs import SetValue, is_pr

router = APIRouter(prefix="/api")
DB = Annotated[Session, Depends(get_db)]

DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
SLOT_STATUSES = {"todo", "active", "done", "skipped", "stopped"}
GEAR = ["Bands", "Hip Halo", "Straps"]


# ---------------------------------------------------------------- helpers


def active_version(db: Session) -> ProgramVersion | None:
    return db.scalar(select(ProgramVersion).where(ProgramVersion.active))


def day_for(db: Session, version: ProgramVersion | None, on: Date) -> ProgramDay | None:
    if version is None:
        return None
    return db.scalar(
        select(ProgramDay).where(
            ProgramDay.program_version_id == version.id, ProgramDay.weekday == on.weekday()
        )
    )


def get_session(db: Session, on: Date, create: bool = True) -> WorkoutSession | None:
    session = db.scalar(select(WorkoutSession).where(WorkoutSession.date == on))
    if session is not None or not create:
        return session
    version = active_version(db)
    day = day_for(db, version, on)
    session = WorkoutSession(
        date=on,
        program_version_id=version.id if version else None,
        program_day_id=day.id if day else None,
        gear={g: False for g in GEAR},
    )
    db.add(session)
    for k, slot in enumerate(day.slots if day else []):
        session.slots.append(
            SessionSlot(slot_key=slot.key, program_slot_id=slot.id, position=k, status="todo")
        )
    db.flush()
    return session


def session_slot(session: WorkoutSession, key: str) -> SessionSlot:
    for s in session.slots:
        if s.slot_key == key:
            return s
    raise HTTPException(404, f"No slot {key} in this session")


def exercise_or_404(db: Session, exercise_id: int) -> Exercise:
    ex = db.get(Exercise, exercise_id)
    if ex is None:
        raise HTTPException(404, "No such exercise")
    return ex


def set_dict(s: SetLog) -> dict:
    return {
        "client_id": s.client_id,
        "slot_key": s.slot_key,
        "exercise_id": s.exercise_id,
        "set_index": s.set_index,
        "weight_lb": s.weight_lb,
        "reps": s.reps,
        "seconds": s.seconds,
        "rir": s.rir,
        "is_pr": s.is_pr,
    }


def stop_dict(s: StopEvent) -> dict:
    return {
        "client_id": s.client_id,
        "slot_key": s.slot_key,
        "exercise_id": s.exercise_id,
        "set_index": s.set_index,
        "weight_lb": s.weight_lb,
        "symptom": s.symptom,
        "note": s.note,
    }


def note_dict(n: Note, day_names: dict[int, str] | None = None) -> dict:
    return {
        "id": n.id,
        "kind": n.kind,
        "text": n.text,
        "cap_lb": n.cap_lb,
        "source": "program" if n.program_version_id else "own",
        "day": (day_names or {}).get(n.program_slot_id) if n.program_slot_id else None,
    }


def last_sets(db: Session, exercise_id: int, before: Date) -> list[dict]:
    """The most recent earlier session's sets for this exercise, by set number."""
    row = db.execute(
        select(WorkoutSession.id)
        .join(SetLog, SetLog.session_id == WorkoutSession.id)
        .where(SetLog.exercise_id == exercise_id, WorkoutSession.date < before)
        .order_by(WorkoutSession.date.desc())
        .limit(1)
    ).first()
    if row is None:
        return []
    sets = db.scalars(
        select(SetLog)
        .where(SetLog.session_id == row[0], SetLog.exercise_id == exercise_id)
        .order_by(SetLog.set_index, SetLog.logged_at)
    )
    return [{"w": s.weight_lb, "r": s.reps, "s": s.seconds} for s in sets]


def slot_names(db: Session, version: ProgramVersion | None) -> dict[int, str]:
    """program_slot id -> 'Mon' etc., for labeling program cues by day."""
    if version is None:
        return {}
    rows = db.execute(
        select(ProgramSlot.id, ProgramDay.weekday)
        .join(ProgramDay)
        .where(ProgramDay.program_version_id == version.id)
    )
    return {slot_id: DAY_NAMES[weekday] for slot_id, weekday in rows}


def exercise_summary(db: Session, ex: Exercise, version, on: Date, day_names) -> dict:
    notes = db.scalars(
        select(Note).where(Note.exercise_id == ex.id, Note.kind != NoteKind.SESSION.value)
    ).all()
    # Pinned: your own notes, then program caps and cues (one copy of each text).
    seen, pinned = set(), []
    for n in sorted(notes, key=lambda n: (n.program_version_id is not None, n.kind != "cap")):
        if n.program_version_id not in (None, getattr(version, "id", None)):
            continue
        if n.text in seen:
            continue
        seen.add(n.text)
        pinned.append(note_dict(n, day_names))
    swaps = []
    if version is not None:
        for sw in db.scalars(
            select(Swap)
            .where(Swap.program_version_id == version.id, Swap.exercise_id == ex.id)
            .order_by(Swap.rank)
        ):
            swaps.append({"id": sw.substitute_id, "rank": sw.rank, "note": sw.note})
    same = []
    if ex.muscle:
        same = [
            e.id
            for e in db.scalars(
                select(Exercise)
                .outerjoin(Exclusion)
                .where(
                    Exercise.muscle == ex.muscle,
                    Exercise.id != ex.id,
                    Exercise.routine.is_(False),
                    Exclusion.id.is_(None),
                )
                .order_by(Exercise.name)
            )
        ]
    return {
        "id": ex.id,
        "name": ex.name,
        "region": ex.region,
        "muscle": ex.muscle,
        "equipment": ex.equipment,
        "assisted": ex.is_assisted,
        "assisted_override": ex.assisted_override,
        "measure": ex.measure,
        "per_side": ex.per_side,
        "routine": ex.routine,
        "pinned": pinned,
        "swaps": swaps,
        "same": same,
        "last": last_sets(db, ex.id, on),
    }


def slot_dict(slot: ProgramSlot, notes: list[Note]) -> dict:
    return {
        "key": slot.key,
        "code": slot.code,
        "block": slot.block,
        "pattern": slot.pattern,
        "exercise_id": slot.exercise_id,
        "alt_exercise_id": slot.alt_exercise_id,
        "display_name": slot.display_name,
        "target_muscle": slot.target_muscle,
        "sets_min": slot.sets_min,
        "sets_max": slot.sets_max,
        "sets_text": slot.sets_text,
        "measure": slot.measure,
        "target_min": slot.target_min,
        "target_max": slot.target_max,
        "target_text": slot.target_text,
        "per_side": slot.per_side,
        "optional": slot.optional,
        "loggable": slot.loggable,
        "notes": [{"kind": n.kind, "text": n.text, "cap_lb": n.cap_lb} for n in notes],
    }


def session_dict(db: Session, session: WorkoutSession) -> dict:
    sets = db.scalars(
        select(SetLog).where(SetLog.session_id == session.id).order_by(SetLog.logged_at)
    )
    stops = db.scalars(select(StopEvent).where(StopEvent.session_id == session.id))
    notes = db.scalars(select(Note).where(Note.session_id == session.id))
    return {
        "date": session.date.isoformat(),
        "gear": session.gear,
        "finished": session.finished,
        "order": [s.slot_key for s in session.slots],
        "slots": {
            s.slot_key: {
                "status": s.status,
                "swapped_to": s.swapped_to_id,
                "done_as": s.done_as_id,
                "later": s.later,
            }
            for s in session.slots
        },
        "sets": [set_dict(s) for s in sets],
        "stops": [stop_dict(s) for s in stops],
        "notes": [{"id": n.id, "text": n.text, "exercise_id": n.exercise_id} for n in notes],
    }


# ---------------------------------------------------------------- program and today


@router.get("/program")
def program(db: DB) -> dict:
    version = active_version(db)
    if version is None:
        return {"version": None, "days": []}
    return {
        "version": version.label,
        "title": version.title,
        "days": [
            {"key": d.key, "weekday": d.weekday, "day": DAY_NAMES[d.weekday], "name": d.name}
            for d in version.days
        ],
    }


@router.get("/today")
def today(date: Date, db: DB) -> dict:
    """Today's plan from the program plus whatever has been logged today."""
    session = get_session(db, date, create=False)
    version = (
        db.get(ProgramVersion, session.program_version_id)
        if session and session.program_version_id
        else active_version(db)
    )
    day = (
        db.get(ProgramDay, session.program_day_id)
        if session and session.program_day_id
        else day_for(db, version, date)
    )
    day_names = slot_names(db, version)
    slots, cardio, ids = [], [], set()
    if day is not None:
        notes_by_slot = defaultdict(list)
        for n in db.scalars(
            select(Note).where(Note.program_slot_id.in_([s.id for s in day.slots]))
        ):
            notes_by_slot[n.program_slot_id].append(n)
        for slot in day.slots:
            slots.append(slot_dict(slot, notes_by_slot[slot.id]))
            ids.update(i for i in (slot.exercise_id, slot.alt_exercise_id) if i)
        cardio = [
            {
                "mode": c.mode,
                "minutes_min": c.minutes_min,
                "minutes_max": c.minutes_max,
                "settings": c.settings,
                "text": c.text,
            }
            for c in db.scalars(
                select(CardioEntry)
                .where(CardioEntry.program_day_id == day.id)
                .order_by(CardioEntry.position)
            )
        ]
    if session is not None:
        for s in session.slots:
            ids.update(i for i in (s.swapped_to_id, s.done_as_id) if i)
    exercises = {}
    queue = list(ids)
    # Planned exercises, then their swaps and same-muscle options (one level, no recursion).
    for ex_id in queue:
        ex = db.get(Exercise, ex_id)
        if ex is None:
            continue
        summary = exercise_summary(db, ex, version, date, day_names)
        exercises[ex.id] = summary
        if ex_id in ids:
            for other in [s["id"] for s in summary["swaps"]] + summary["same"]:
                if other not in ids and other not in queue:
                    queue.append(other)
    return {
        "date": date.isoformat(),
        "version": version.label if version else None,
        "day": None
        if day is None
        else {
            "key": day.key,
            "weekday": day.weekday,
            "day": DAY_NAMES[day.weekday],
            "name": day.name,
            "title": day.title,
            "subtitle": day.subtitle,
            "notes": day.notes,
        },
        "slots": slots,
        "cardio": cardio,
        "gear_options": GEAR,
        "exercises": exercises,
        "session": session_dict(db, session) if session else None,
    }


# ---------------------------------------------------------------- session writes


class SlotState(BaseModel):
    status: str = "todo"
    swapped_to: int | None = None
    done_as: int | None = None
    later: bool = False


class SessionState(BaseModel):
    gear: dict[str, bool] = Field(default_factory=dict)
    finished: bool = False
    order: list[str] = Field(default_factory=list)
    slots: dict[str, SlotState] = Field(default_factory=dict)


@router.put("/sessions/{date}")
def put_session(date: Date, body: SessionState, db: DB) -> dict:
    """Session-level state from the phone: order, gear, statuses, swaps. Last write wins."""
    session = get_session(db, date)
    session.gear = {g: bool(body.gear.get(g, session.gear.get(g, False))) for g in GEAR}
    session.finished = body.finished
    by_key = {s.slot_key: s for s in session.slots}
    for key, state in body.slots.items():
        if key not in by_key:
            continue
        if state.status not in SLOT_STATUSES:
            raise HTTPException(422, f"Unknown status {state.status}")
        for ex_id in (state.swapped_to, state.done_as):
            if ex_id is not None:
                exercise_or_404(db, ex_id)
        s = by_key[key]
        s.status, s.swapped_to_id, s.done_as_id, s.later = (
            state.status,
            state.swapped_to,
            state.done_as,
            state.later,
        )
    if body.order and set(body.order) == set(by_key):
        for k, key in enumerate(body.order):
            by_key[key].position = k
    db.commit()
    db.refresh(session)
    session.slots.sort(key=lambda s: s.position)
    return session_dict(db, session)


class SetIn(BaseModel):
    client_id: str = Field(min_length=1, max_length=80)
    slot_key: str
    exercise_id: int
    set_index: int = Field(ge=0)
    weight_lb: float | None = None
    reps: int | None = Field(default=None, ge=0)
    seconds: int | None = Field(default=None, ge=0)
    rir: int | None = Field(default=None, ge=0, le=10)


@router.post("/sessions/{date}/sets", status_code=201)
def log_set(date: Date, body: SetIn, response: Response, db: DB) -> dict:
    existing = db.scalar(select(SetLog).where(SetLog.client_id == body.client_id))
    if existing is not None:
        response.status_code = 200
        return set_dict(existing)
    session = get_session(db, date)
    slot = session_slot(session, body.slot_key)
    ex = exercise_or_404(db, body.exercise_id)
    clash = db.scalar(
        select(SetLog).where(
            SetLog.session_id == session.id,
            SetLog.slot_key == body.slot_key,
            SetLog.set_index == body.set_index,
        )
    )
    if clash is not None:
        raise HTTPException(409, "That set is already logged; undo it first")
    program_slot = db.get(ProgramSlot, slot.program_slot_id) if slot.program_slot_id else None
    if program_slot is not None and not program_slot.loggable:
        raise HTTPException(422, "This item is a checklist item; mark it done instead")
    stopped = db.scalar(
        select(StopEvent).where(StopEvent.session_id == session.id, StopEvent.exercise_id == ex.id)
    )
    prior = [
        SetValue(p.weight_lb, p.reps, p.seconds)
        for p in db.scalars(select(SetLog).where(SetLog.exercise_id == ex.id))
    ]
    new = SetValue(body.weight_lb, body.reps, body.seconds)
    pr = stopped is None and is_pr(
        new,
        prior,
        assisted=ex.is_assisted,
        measure=ex.measure,
        rep_floor=program_slot.target_min if program_slot else None,
    )
    row = SetLog(
        client_id=body.client_id,
        session_id=session.id,
        slot_key=body.slot_key,
        exercise_id=ex.id,
        set_index=body.set_index,
        weight_lb=body.weight_lb,
        reps=body.reps,
        seconds=body.seconds,
        rir=body.rir,
        is_pr=pr,
    )
    db.add(row)
    slot.done_as_id = ex.id
    if slot.status == "todo":
        slot.status = "active"
    db.commit()
    return set_dict(row)


@router.delete("/sessions/{date}/sets/{client_id:path}", status_code=204)
def undo_set(date: Date, client_id: str, db: DB) -> Response:
    session = get_session(db, date, create=False)
    row = db.scalar(select(SetLog).where(SetLog.client_id == client_id))
    if session is not None and row is not None and row.session_id == session.id:
        slot = session_slot(session, row.slot_key)
        db.delete(row)
        db.flush()
        left = db.scalar(
            select(SetLog).where(SetLog.session_id == session.id, SetLog.slot_key == row.slot_key)
        )
        if left is None:
            slot.done_as_id = None
        if slot.status == "done":
            slot.status = "active"
        db.commit()
    return Response(status_code=204)  # already gone is fine: the phone may retry


class StopIn(BaseModel):
    client_id: str = Field(min_length=1, max_length=80)
    slot_key: str
    exercise_id: int
    set_index: int = Field(ge=0)
    weight_lb: float | None = None
    symptom: str = Field(min_length=1, max_length=60)
    note: str | None = None


@router.post("/sessions/{date}/stops", status_code=201)
def stop(date: Date, body: StopIn, response: Response, db: DB) -> dict:
    existing = db.scalar(select(StopEvent).where(StopEvent.client_id == body.client_id))
    if existing is not None:
        response.status_code = 200
        return stop_dict(existing)
    session = get_session(db, date)
    slot = session_slot(session, body.slot_key)
    exercise_or_404(db, body.exercise_id)
    row = StopEvent(session_id=session.id, **body.model_dump())
    db.add(row)
    slot.status = "stopped"
    slot.done_as_id = body.exercise_id
    db.commit()
    return stop_dict(row)


class SwapIn(BaseModel):
    exercise_id: int | None = None


@router.post("/sessions/{date}/slots/{slot_key}/swap")
def swap(date: Date, slot_key: str, body: SwapIn, db: DB) -> dict:
    session = get_session(db, date)
    slot = session_slot(session, slot_key)
    if body.exercise_id is not None:
        exercise_or_404(db, body.exercise_id)
    planned = db.get(ProgramSlot, slot.program_slot_id) if slot.program_slot_id else None
    slot.swapped_to_id = (
        None if planned and body.exercise_id == planned.exercise_id else body.exercise_id
    )
    db.commit()
    return session_dict(db, session)


@router.post("/sessions/{date}/slots/{slot_key}/later")
def later(date: Date, slot_key: str, db: DB) -> dict:
    """Moves the slot to the bottom of today's order."""
    session = get_session(db, date)
    slot = session_slot(session, slot_key)
    others = [s for s in session.slots if s is not slot]
    for k, s in enumerate(others):
        s.position = k
    slot.position = len(others)
    slot.later = True
    if slot.status == "active":
        slot.status = "todo"
    db.commit()
    session.slots.sort(key=lambda s: s.position)
    return session_dict(db, session)


# ---------------------------------------------------------------- notes


class NoteIn(BaseModel):
    kind: str
    text: str = Field(min_length=1, max_length=2000)
    exercise_id: int | None = None
    date: Date | None = None  # required for session notes
    cap_lb: float | None = None


@router.post("/notes", status_code=201)
def add_note(body: NoteIn, db: DB) -> dict:
    if body.kind not in {k.value for k in NoteKind}:
        raise HTTPException(422, f"Unknown note kind {body.kind}")
    if body.exercise_id is not None:
        exercise_or_404(db, body.exercise_id)
    session_id = None
    if body.kind == NoteKind.SESSION.value:
        if body.date is None:
            raise HTTPException(422, "A session note needs the session date")
        session_id = get_session(db, body.date).id
    elif body.exercise_id is None:
        raise HTTPException(422, "A pinned note needs an exercise")
    note = Note(
        kind=body.kind,
        text=body.text,
        exercise_id=body.exercise_id,
        session_id=session_id,
        cap_lb=body.cap_lb,
    )
    db.add(note)
    db.commit()
    return note_dict(note)


@router.delete("/notes/{note_id}", status_code=204)
def delete_note(note_id: int, db: DB) -> Response:
    note = db.get(Note, note_id)
    if note is not None:
        if note.program_version_id is not None:
            raise HTTPException(409, "Program notes change through the program, not here")
        db.delete(note)
        db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------- library and cards


@router.get("/exercises")
def library(db: DB) -> dict:
    version = active_version(db)
    days: dict[int, list[str]] = defaultdict(list)
    subs: set[int] = set()
    if version is not None:
        for day in version.days:
            for slot in day.slots:
                for ex_id in (slot.exercise_id, slot.alt_exercise_id):
                    if ex_id and DAY_NAMES[day.weekday] not in days[ex_id]:
                        days[ex_id].append(DAY_NAMES[day.weekday])
        subs = {
            s.substitute_id
            for s in db.scalars(select(Swap).where(Swap.program_version_id == version.id))
        }
    out = []
    for ex in db.scalars(select(Exercise).order_by(Exercise.name)):
        if ex.routine:
            continue
        top = db.scalar(
            select(SetLog)
            .join(WorkoutSession)
            .where(SetLog.exercise_id == ex.id)
            .order_by(WorkoutSession.date.desc(), SetLog.set_index)
        )
        out.append(
            {
                "id": ex.id,
                "name": ex.name,
                "region": ex.region or "Other",
                "muscle": ex.muscle or "Other",
                "equipment": ex.equipment,
                "assisted": ex.is_assisted,
                "measure": ex.measure,
                "per_side": ex.per_side,
                "days": days.get(ex.id, []),
                "substitute": ex.id in subs and ex.id not in days,
                "has_video": bool(ex.media),
                "excluded": None
                if ex.exclusion is None
                else {
                    "kind": ex.exclusion.kind,
                    "label": ex.exclusion.label,
                    "reason": ex.exclusion.reason,
                    "revisit": ex.exclusion.revisit,
                },
                "last": None
                if top is None
                else {"w": top.weight_lb, "r": top.reps, "s": top.seconds},
            }
        )
    return {"version": version.label if version else None, "exercises": out}


class ExercisePatch(BaseModel):
    # True / False overrides the program's wording; None goes back to following it.
    assisted: bool | None = None


@router.patch("/exercises/{exercise_id}")
def patch_exercise(exercise_id: int, body: ExercisePatch, db: DB) -> dict:
    ex = exercise_or_404(db, exercise_id)
    if "assisted" in body.model_fields_set:
        ex.assisted_override = body.assisted
    db.commit()
    return {"id": ex.id, "assisted": ex.is_assisted, "assisted_override": ex.assisted_override}


@router.get("/exercises/{exercise_id}")
def card(exercise_id: int, db: DB) -> dict:
    ex = exercise_or_404(db, exercise_id)
    version = active_version(db)
    day_names = slot_names(db, version)
    summary = exercise_summary(db, ex, version, Date.max, day_names)
    plan = []
    if version is not None:
        for day in version.days:
            for slot in day.slots:
                if exercise_id in (slot.exercise_id, slot.alt_exercise_id):
                    plan.append(
                        {
                            "day": DAY_NAMES[day.weekday],
                            "code": slot.code,
                            "sets_text": slot.sets_text,
                            "target_text": slot.target_text,
                            "optional": slot.optional,
                        }
                    )
    sessions = []
    rows = db.execute(
        select(WorkoutSession)
        .join(SetLog, SetLog.session_id == WorkoutSession.id, isouter=True)
        .join(StopEvent, StopEvent.session_id == WorkoutSession.id, isouter=True)
        .where((SetLog.exercise_id == ex.id) | (StopEvent.exercise_id == ex.id))
        .order_by(WorkoutSession.date)
        .distinct()
    ).scalars()
    for session in rows:
        sets = db.scalars(
            select(SetLog)
            .where(SetLog.session_id == session.id, SetLog.exercise_id == ex.id)
            .order_by(SetLog.set_index)
        )
        stop_row = db.scalar(
            select(StopEvent).where(
                StopEvent.session_id == session.id, StopEvent.exercise_id == ex.id
            )
        )
        note = db.scalar(
            select(Note).where(Note.session_id == session.id, Note.exercise_id == ex.id)
        )
        sessions.append(
            {
                "date": session.date.isoformat(),
                "sets": [set_dict(s) for s in sets],
                "stop": stop_dict(stop_row) if stop_row else None,
                "note": note.text if note else "",
            }
        )
    related = {}
    for other_id in [sw["id"] for sw in summary["swaps"]] + summary["same"]:
        other = db.get(Exercise, other_id)
        if other is not None:
            related[other.id] = exercise_summary(db, other, version, Date.max, day_names)
    excl = ex.exclusion
    return {
        **summary,
        "related": related,
        "plan": plan,
        "excluded": None
        if excl is None
        else {
            "kind": excl.kind,
            "label": excl.label,
            "reason": excl.reason,
            "revisit": excl.revisit,
        },
        "media": [{"kind": m.kind, "label": m.label, "url": m.url} for m in ex.media],
        "sessions": sessions,
    }
