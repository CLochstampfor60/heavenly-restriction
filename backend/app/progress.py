"""Progress from real logs: the week, the month calendar, charts, sets per muscle, records.

Day status (calendar and week meter):
- stop:    a stop event that day.
- done:    every required slot (loggable, not optional) ended, or the workout was finished.
- partial: something logged or ticked, but not all of the above.
- skip:    a past lifting day with nothing logged.
- cardio:  a non-lifting day with cardio ticked done.
- rest:    a past non-lifting day without cardio.
Days before the first session ever have no status, so a new install is not a wall of skips.
"""

from calendar import monthrange
from collections import defaultdict
from datetime import date as Date
from datetime import timedelta

from fastapi import APIRouter
from sqlalchemy import func, select

from app.api import DAY_NAMES, DB, active_version
from app.models import (
    BodyMetric,
    Exercise,
    ProgramDay,
    ProgramVersion,
    SetLog,
    StopEvent,
    WorkoutSession,
)
from app.prs import e1rm

router = APIRouter(prefix="/api")

ENDED = {"done", "stopped", "skipped"}


def month_start(d: Date, back: int = 0) -> Date:
    y, m = d.year, d.month - back
    while m < 1:
        y, m = y - 1, m + 12
    return Date(y, m, 1)


def required_keys(day: ProgramDay | None) -> set[str]:
    if day is None:
        return set()
    return {s.key for s in day.slots if s.loggable and not s.optional}


def cardio_minutes(day: ProgramDay | None, statuses: dict, only_done: bool) -> int:
    if day is None:
        return 0
    total = 0
    for k, entry in enumerate(day.cardio):
        if not only_done or statuses.get(f"cardio{k + 1}") == "done":
            total += entry.minutes_min or 0
    return total


def session_value(ex: Exercise, sets: list[SetLog]) -> float | None:
    """One number per session for the lift chart, by the exercise's PR rule."""
    if not sets:
        return None
    if ex.measure == "seconds":
        return max((s.seconds or 0) for s in sets)
    if ex.is_assisted:
        return min((s.weight_lb or 0) for s in sets)
    if all(not s.weight_lb for s in sets):
        return max((s.reps or 0) for s in sets)
    return max(e1rm(s.weight_lb or 0, s.reps or 0) for s in sets)


@router.get("/progress")
def progress(date: Date, db: DB) -> dict:
    version = active_version(db)
    days_by_weekday: dict[int, ProgramDay] = {}
    if version is not None:
        days_by_weekday = {d.weekday: d for d in version.days}
    lifting = sorted(wd for wd, d in days_by_weekday.items() if required_keys(d))

    sessions = {s.date: s for s in db.scalars(select(WorkoutSession))}
    first_ever = min(sessions) if sessions else None
    stops = {s.session_id for s in db.scalars(select(StopEvent))}
    logged = set(db.scalars(select(SetLog.session_id).distinct()))

    def day_of(d: Date) -> ProgramDay | None:
        s = sessions.get(d)
        if s is not None and s.program_day_id:
            return db.get(ProgramDay, s.program_day_id)
        return days_by_weekday.get(d.weekday())

    def status(d: Date) -> str | None:
        if d > date or first_ever is None or d < first_ever:
            return None
        day = day_of(d)
        need = required_keys(day)
        s = sessions.get(d)
        cardio_done = bool(s and any(v == "done" for v in (s.cardio or {}).values()))
        if s is not None:
            if s.id in stops:
                return "stop"
            by_key = {x.slot_key: x.status for x in s.slots}
            if need and (s.finished or all(by_key.get(k) in ENDED for k in need)):
                return "done"
            touched = s.id in logged or any(v != "todo" for v in by_key.values())
            if need and touched:
                return "partial"
        if need:
            return "skip" if d < date else None
        if cardio_done:
            return "cardio"
        return "rest" if d < date else None

    # ---- this week (Mon-Sun) and the month calendar
    monday = date - timedelta(days=date.weekday())
    week = [
        {"date": (monday + timedelta(days=wd)).isoformat(), "day": DAY_NAMES[wd],
         "status": status(monday + timedelta(days=wd))}
        for wd in lifting
    ]  # fmt: skip
    first = date.replace(day=1)
    calendar = {}
    for k in range(monthrange(date.year, date.month)[1]):
        d = first + timedelta(days=k)
        calendar[d.isoformat()] = status(d)

    # ---- cardio: planned target from the program, done from ticks
    target = sum(cardio_minutes(d, {}, only_done=False) for d in days_by_weekday.values())

    def cardio_done_on(d: Date) -> int:
        s = sessions.get(d)
        return cardio_minutes(day_of(d), s.cardio or {}, only_done=True) if s else 0

    cardio_week = []
    for wd in range(7):
        d = monday + timedelta(days=wd)
        planned = cardio_minutes(day_of(d), {}, only_done=False) if d > date else 0
        cardio_week.append([DAY_NAMES[wd][0], cardio_done_on(d), planned or None])
    cardio_month = []
    wk = first - timedelta(days=first.weekday())
    while wk <= date:
        total = sum(cardio_done_on(wk + timedelta(days=i)) for i in range(7))
        cardio_month.append([f"{wk.month}/{wk.day}", total])
        wk += timedelta(days=7)
    cardio_year = []
    for back in range(11, -1, -1):
        m0 = month_start(date, back)
        n = monthrange(m0.year, m0.month)[1]
        total = sum(cardio_done_on(m0 + timedelta(days=i)) for i in range(n))
        if total:
            cardio_year.append(
                [m0.strftime("%b")[0], round(total / (n / 7)), None, m0.strftime("%b %Y")]
            )

    # ---- lift: the exercise with the most sessions in the last 90 days
    since = date - timedelta(days=90)
    rows = db.execute(
        select(SetLog.exercise_id, func.count(func.distinct(SetLog.session_id)))
        .join(WorkoutSession)
        .where(WorkoutSession.date >= since, WorkoutSession.date <= date)
        .group_by(SetLog.exercise_id)
        .order_by(func.count(func.distinct(SetLog.session_id)).desc(), SetLog.exercise_id)
    ).first()
    lift = None
    if rows is not None:
        ex = db.get(Exercise, rows[0])
        per_session: dict[Date, list[SetLog]] = defaultdict(list)
        for s in db.scalars(select(SetLog).join(WorkoutSession).where(SetLog.exercise_id == ex.id)):
            per_session[db.get(WorkoutSession, s.session_id).date].append(s)
        points = sorted((d, session_value(ex, sets)) for d, sets in per_session.items())
        this_month = (date.year, date.month)
        month_pts = [
            [f"{d.month}/{d.day}", round(v, 1)]
            for d, v in points
            if (d.year, d.month) == this_month
        ]
        year_pts = []
        for back in range(11, -1, -1):
            m0 = month_start(date, back)
            vals = [v for d, v in points if (d.year, d.month) == (m0.year, m0.month)]
            if vals:
                best = min(vals) if ex.is_assisted else max(vals)
                year_pts.append([m0.strftime("%b")[0], round(best, 1), None, m0.strftime("%b %Y")])
        if ex.measure == "seconds":
            label, unit = "longest hold", "s"
        elif ex.is_assisted:
            label, unit = "least assistance", "lb"
        else:
            label, unit = "est. 1RM", "lb"
        lift = {
            "exercise_id": ex.id,
            "name": f"{ex.name} · {label}",
            "unit": unit,
            "assisted": ex.is_assisted,
            "month": month_pts,
            "year": year_pts,
        }

    # ---- sets per muscle group this week
    muscle = db.execute(
        select(func.coalesce(Exercise.region, "Other"), func.count(SetLog.id))
        .join(SetLog, SetLog.exercise_id == Exercise.id)
        .join(WorkoutSession, WorkoutSession.id == SetLog.session_id)
        .where(WorkoutSession.date >= monday, WorkoutSession.date <= date)
        .group_by(Exercise.region)
        .order_by(func.count(SetLog.id).desc())
    ).all()

    # ---- records: each exercise's latest PR, newest first
    latest: dict[int, tuple[Date, SetLog]] = {}
    for s in db.scalars(select(SetLog).where(SetLog.is_pr)):
        d = db.get(WorkoutSession, s.session_id).date
        if s.exercise_id not in latest or d >= latest[s.exercise_id][0]:
            latest[s.exercise_id] = (d, s)
    records = []
    for ex_id, (d, s) in sorted(latest.items(), key=lambda kv: kv[1][0], reverse=True)[:8]:
        ex = db.get(Exercise, ex_id)
        records.append(
            {
                "exercise_id": ex_id,
                "name": ex.name,
                "date": d.isoformat(),
                "set": {"w": s.weight_lb, "r": s.reps, "s": s.seconds},
                "assisted": ex.is_assisted,
                "measure": ex.measure,
                "per_side": ex.per_side,
            }
        )
    pr_days = sorted(
        {
            d.isoformat()
            for (d,) in db.execute(
                select(WorkoutSession.date).join(SetLog).where(SetLog.is_pr).distinct()
            )
        }
    )

    # ---- body metrics
    body = {}
    for kind in ("bodyweight", "waist"):
        rows_m = db.scalars(
            select(BodyMetric).where(BodyMetric.kind == kind).order_by(BodyMetric.date)
        ).all()
        month_pts = [
            [f"{m.date.month}/{m.date.day}", m.value]
            for m in rows_m
            if (m.date.year, m.date.month) == (date.year, date.month)
        ]
        year_pts = []
        for back in range(11, -1, -1):
            m0 = month_start(date, back)
            vals = [m.value for m in rows_m if (m.date.year, m.date.month) == (m0.year, m0.month)]
            if vals:
                year_pts.append(
                    [
                        m0.strftime("%b")[0],
                        round(sum(vals) / len(vals), 2),
                        None,
                        m0.strftime("%b %Y"),
                    ]
                )
        body[kind] = {"month": month_pts, "year": year_pts}

    return {
        "date": date.isoformat(),
        "version": version.label if isinstance(version, ProgramVersion) else None,
        "lifting_weekdays": lifting,
        "week": week,
        "calendar": calendar,
        "pr_days": pr_days,
        "cardio": {
            "target": target,
            "week": cardio_week,
            "month": cardio_month,
            "year": cardio_year,
        },
        "lift": lift,
        "body": body,
        "muscle_sets": [[name, n] for name, n in muscle],
        "records": records,
    }
